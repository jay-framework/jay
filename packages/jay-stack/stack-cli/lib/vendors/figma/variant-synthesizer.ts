import type { HTMLElement } from 'node-html-parser';
import { NodeType } from 'node-html-parser';
import type { ContractTag } from '@jay-framework/editor-protocol';
import type { ImportIRNode } from './import-ir';
import type { PageContractPath } from './pageContractPath';
import type { LayerBinding } from './types';
import { tokenizeCondition } from './condition-tokenizer';
import { findContractTag } from './binding-analysis';
import { generateNodeId, buildDomPath, getSemanticAnchors } from './id-generator';
import { extractBindingsFromElement } from './binding-reconstructor';
import type { ImportContractContext } from './binding-reconstructor';

import type { ConditionIdentifier } from './condition-tokenizer';

const VARIANT_SYNTHETIC_DIMENSION = 'VARIANT_SYNTHETIC_DIMENSION';
const EXPRESSION_OPS = new Set(['>', '<', '>=', '<=']);

/**
 * Convert a condition token to the variant value string stored in Figma.
 *
 * - `==` / `===`  → bare value (`IMAGE`)
 * - `!=` / `!==`  → `!` prefix (`!OUT_OF_STOCK`)
 * - `>`, `<`, `>=`, `<=` → operator + value (`> 0`, `<= 100`)
 * - boolean truthy → `true`
 * - boolean negated → `false`
 */
function tokenToVariantValue(token: ConditionIdentifier): string | null {
    if (token.operator && token.comparedValue != null) {
        if (token.operator === '==') return token.comparedValue;
        if (token.operator === '!=') return `!${token.comparedValue}`;
        if (EXPRESSION_OPS.has(token.operator)) return `${token.operator} ${token.comparedValue}`;
    }
    if (!token.operator) {
        return token.isNegated ? 'false' : 'true';
    }
    return null;
}

export interface VariantGroup {
    elements: HTMLElement[];
    conditions: string[];
    containerParent: HTMLElement;
}

export interface SynthesizedVariant {
    componentSet: ImportIRNode;
    instance: ImportIRNode;
    warnings: string[];
}

function getElementChildren(parent: HTMLElement): HTMLElement[] {
    return parent.childNodes.filter((n) => n.nodeType === NodeType.ELEMENT_NODE) as HTMLElement[];
}

/**
 * Scan children of parent for elements with if="..." attributes.
 * Consecutive if-siblings form a group. Single if-elements form a group of 1.
 * Non-if siblings break consecutive runs.
 */
export function detectVariantGroups(parent: HTMLElement): VariantGroup[] {
    const children = getElementChildren(parent);
    const groups: VariantGroup[] = [];
    let currentGroup: { elements: HTMLElement[]; conditions: string[] } | null = null;

    for (const child of children) {
        const ifExpr = child.getAttribute('if');
        if (ifExpr != null && ifExpr.trim()) {
            const condition = ifExpr.trim();
            if (currentGroup) {
                currentGroup.elements.push(child);
                currentGroup.conditions.push(condition);
            } else {
                currentGroup = { elements: [child], conditions: [condition] };
            }
        } else {
            if (currentGroup && currentGroup.elements.length >= 1) {
                groups.push({
                    ...currentGroup,
                    containerParent: parent,
                });
            }
            currentGroup = null;
        }
    }

    if (currentGroup && currentGroup.elements.length >= 1) {
        groups.push({
            ...currentGroup,
            containerParent: parent,
        });
    }

    return groups;
}

interface DimensionInfo {
    name: string;
    tagPath: string[];
    values: Set<string>;
    isBoolean: boolean;
    isComputed: boolean;
}

function classifyDimensions(
    groups: { elements: HTMLElement[]; conditions: string[] }[],
    contractTags: ContractTag[],
): { dimensions: DimensionInfo[]; warnings: string[] } {
    const warnings: string[] = [];
    const pathToDimension = new Map<
        string,
        { values: Set<string>; isBoolean: boolean; isComputed: boolean }
    >();

    for (const group of groups) {
        for (const condition of group.conditions) {
            const tokens = tokenizeCondition(condition);
            for (const token of tokens) {
                if (token.isComputed) {
                    warnings.push(
                        `${VARIANT_SYNTHETIC_DIMENSION}: Computed expression "${token.rawExpression}" used as variant dimension`,
                    );
                    continue;
                }
                if (token.path.length === 0) continue;

                const pathKey = token.path.join('.');
                const lastSegment = token.path[token.path.length - 1]!;

                const variantValue = tokenToVariantValue(token);
                if (!pathToDimension.has(pathKey)) {
                    const values = new Set<string>();
                    let isBoolean = false;
                    if (variantValue != null) {
                        values.add(variantValue);
                        if (!token.operator) isBoolean = true;
                    }
                    pathToDimension.set(pathKey, {
                        values,
                        isBoolean,
                        isComputed: token.isComputed,
                    });
                } else {
                    const dim = pathToDimension.get(pathKey)!;
                    if (variantValue != null) {
                        dim.values.add(variantValue);
                        if (!token.operator) dim.isBoolean = true;
                    }
                }
            }
        }
    }

    const dimensions: DimensionInfo[] = [];
    for (const [pathKey, dim] of pathToDimension) {
        const pathParts = pathKey.split('.');
        const lastSegment = pathParts[pathParts.length - 1]!;
        const tag = findContractTag(contractTags, pathParts);
        dimensions.push({
            name: lastSegment,
            tagPath: pathParts,
            values: dim.values,
            isBoolean: dim.isBoolean,
            isComputed: dim.isComputed,
        });
    }

    return { dimensions, warnings };
}

const DEFAULT_VARIANT_VALUE = '*';

function getVariantPropertiesForCondition(
    condition: string,
    dimensions: DimensionInfo[],
): Record<string, string> {
    const result: Record<string, string> = {};
    const tokens = tokenizeCondition(condition);

    for (const dim of dimensions) {
        const pathKey = dim.tagPath.join('.');
        const matchingToken = tokens.find((t) => t.path.join('.') === pathKey);
        if (matchingToken) {
            result[dim.name] = tokenToVariantValue(matchingToken) ?? DEFAULT_VARIANT_VALUE;
        } else {
            result[dim.name] = DEFAULT_VARIANT_VALUE;
        }
    }
    return result;
}

/**
 * Checks whether an element is visible in the default scenario.
 * Returns true if visible, false if hidden, undefined if unknown.
 */
export type ElementVisibilityChecker = (element: HTMLElement) => boolean | undefined;

/**
 * Determine which component should be the default for the instance in the main frame.
 *
 * Uses a visibility checker (backed by the default scenario's computed styles)
 * to find the element that is visible in the page's natural state.
 * Returns null if no element is visible (instance should use _hidden_ variant).
 */
function pickDefaultComponent(
    group: VariantGroup,
    components: ImportIRNode[],
    dimensions: DimensionInfo[],
    isVisibleInDefault?: ElementVisibilityChecker,
): ImportIRNode | null {
    if (!isVisibleInDefault) {
        return components[0]!;
    }

    for (let i = 0; i < group.elements.length; i++) {
        const el = group.elements[i]!;
        const visible = isVisibleInDefault(el);
        if (visible !== true) continue;

        const condition = group.conditions[i]!;
        const variantProps = getVariantPropertiesForCondition(condition, dimensions);
        const variantKey = Object.entries(variantProps)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
        const match = components.find((c) => c.name === variantKey);
        if (match) return match;
    }

    return null;
}

/**
 * Synthesize COMPONENT_SET + INSTANCE from a variant group.
 */
export function synthesizeVariant(
    group: VariantGroup,
    body: HTMLElement,
    contractTags: ContractTag[],
    jayPageSectionId: string,
    pageContractPath: PageContractPath,
    buildChildNode: (element: HTMLElement) => ImportIRNode,
    contractContext?: ImportContractContext,
    isVisibleInDefault?: ElementVisibilityChecker,
): SynthesizedVariant {
    const warnings: string[] = [];
    const { dimensions, warnings: dimWarnings } = classifyDimensions(
        [{ elements: group.elements, conditions: group.conditions }],
        contractTags,
    );
    warnings.push(...dimWarnings);

    const dimensionNames = dimensions.map((d) => d.name).join(', ');
    const componentSetName = dimensionNames ? `${dimensionNames} variants` : 'variants';

    const componentSetDomPath = buildDomPath(group.containerParent, body);
    const componentSetId = generateNodeId(componentSetDomPath, [
        'variant-set',
        ...group.conditions,
    ]);

    // Group elements by their variant property signature to merge duplicates.
    // Multiple siblings with the same condition become children of one COMPONENT.
    const variantKeyToComponent = new Map<
        string,
        {
            props: Record<string, string>;
            children: ImportIRNode[];
            firstElement: HTMLElement;
            conditions: string[];
        }
    >();
    const insertionOrder: string[] = [];

    for (let i = 0; i < group.elements.length; i++) {
        const element = group.elements[i]!;
        const condition = group.conditions[i]!;
        const variantProps = getVariantPropertiesForCondition(condition, dimensions);
        const variantKey = Object.entries(variantProps)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');

        const childNode = buildChildNode(element);
        const existing = variantKeyToComponent.get(variantKey);
        if (existing) {
            existing.children.push(childNode);
            existing.conditions.push(condition);
        } else {
            variantKeyToComponent.set(variantKey, {
                props: variantProps,
                children: [childNode],
                firstElement: element,
                conditions: [condition],
            });
            insertionOrder.push(variantKey);
        }
    }

    const components: ImportIRNode[] = [];
    for (const variantKey of insertionOrder) {
        const entry = variantKeyToComponent.get(variantKey)!;
        const compDomPath = buildDomPath(entry.firstElement, body);
        const compId = generateNodeId(compDomPath, [
            'variant',
            ...entry.conditions,
            ...getSemanticAnchors(entry.firstElement),
        ]);

        components.push({
            id: compId,
            sourcePath: 'variant-synthesizer',
            kind: 'COMPONENT',
            name: variantKey,
            variantProperties: entry.props,
            children: entry.children,
        });
    }

    // Build componentPropertyDefinitions from ALL values actually used by components,
    // including synthetic values like "*" (wildcard default) and "!X" (inequality)
    const componentPropertyDefinitions: Record<
        string,
        { type: 'VARIANT'; variantOptions: string[] }
    > = {};
    for (const dim of dimensions) {
        const allValues = new Set(dim.values);
        for (const comp of components) {
            const val = comp.variantProperties?.[dim.name];
            if (val) allValues.add(val);
        }
        componentPropertyDefinitions[dim.name] = {
            type: 'VARIANT',
            variantOptions: Array.from(allValues).sort(),
        };
    }

    const componentSet: ImportIRNode = {
        id: componentSetId,
        sourcePath: 'variant-synthesizer',
        kind: 'COMPONENT_SET',
        name: componentSetName,
        componentPropertyDefinitions,
        children: components,
    };

    const defaultComponent = pickDefaultComponent(
        group,
        components,
        dimensions,
        isVisibleInDefault,
    );
    const preferHiddenDefault = defaultComponent === null;
    const defaultComponentId = defaultComponent?.id ?? components[0]!.id;

    const instanceBindings: ImportIRNode['bindings'] = [];
    for (const dim of dimensions) {
        const tag = findContractTag(contractTags, dim.tagPath);
        if (tag) {
            let resolvedPath = pageContractPath;
            if (contractContext && dim.tagPath.length > 0) {
                const rootSegment = dim.tagPath[0];
                const headlessImport = contractContext.headlessImports.find(
                    (hi) => hi.key === rootSegment,
                );
                if (headlessImport) {
                    resolvedPath = headlessImport.pageContractPath;
                }
            }
            const binding: LayerBinding = {
                pageContractPath: resolvedPath,
                jayPageSectionId,
                tagPath: dim.tagPath,
                property: dim.name,
            };
            instanceBindings.push({ kind: 'layer', binding });
        }
    }

    const instanceDomPath = buildDomPath(group.containerParent, body);
    const instanceId = generateNodeId(instanceDomPath, ['variant-instance', ...group.conditions]);

    // Compute INSTANCE dimensions from the max of all COMPONENT children
    let maxWidth = 0;
    let maxHeight = 0;
    for (const comp of components) {
        const child = comp.children?.[0];
        if (child?.style) {
            if (child.style.width !== undefined && child.style.width > maxWidth)
                maxWidth = child.style.width;
            if (child.style.height !== undefined && child.style.height > maxHeight)
                maxHeight = child.style.height;
        }
    }

    const instance: ImportIRNode = {
        id: instanceId,
        sourcePath: 'variant-synthesizer',
        kind: 'INSTANCE',
        name: componentSetName,
        mainComponentId: defaultComponentId,
        preferHiddenDefault,
        bindings: instanceBindings,
        style:
            maxWidth > 0 || maxHeight > 0
                ? {
                      ...(maxWidth > 0 ? { width: maxWidth } : {}),
                      ...(maxHeight > 0 ? { height: maxHeight } : {}),
                  }
                : undefined,
    };

    return { componentSet, instance, warnings };
}

/**
 * Synthesize a repeater (forEach) element into a FRAME with template child.
 */
export function synthesizeRepeater(
    element: HTMLElement,
    body: HTMLElement,
    contractTags: ContractTag[],
    jayPageSectionId: string,
    pageContractPath: PageContractPath,
    buildChildNode: (element: HTMLElement) => ImportIRNode,
): ImportIRNode {
    const forEachPath = element.getAttribute('forEach')?.trim();
    const trackBy = element.getAttribute('trackBy')?.trim();

    const { bindings } = extractBindingsFromElement(
        element,
        contractTags,
        jayPageSectionId,
        pageContractPath,
    );

    const layerBindings = bindings
        .filter((b): b is { kind: 'layer'; binding: LayerBinding } => b.kind === 'layer')
        .map((b) => b.binding);

    const children = getElementChildren(element);
    const firstChild = children[0];
    const childNode = firstChild ? buildChildNode(firstChild) : undefined;

    const domPath = buildDomPath(element, body);
    const frameId = generateNodeId(domPath, [
        'repeater',
        forEachPath ?? '',
        trackBy ?? '',
        ...getSemanticAnchors(element),
    ]);

    return {
        id: frameId,
        sourcePath: 'variant-synthesizer',
        kind: 'FRAME',
        name: element.rawTagName || 'div',
        visible: true,
        style: { layoutMode: 'column' },
        bindings:
            layerBindings.length > 0
                ? layerBindings.map((b) => ({ kind: 'layer' as const, binding: b }))
                : undefined,
        children: childNode ? [childNode] : [],
    };
}
