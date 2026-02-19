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

const VARIANT_SYNTHETIC_DIMENSION = 'VARIANT_SYNTHETIC_DIMENSION';

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
    return parent.childNodes.filter(
        (n) => n.nodeType === NodeType.ELEMENT_NODE,
    ) as HTMLElement[];
}

/**
 * Scan children of parent for consecutive siblings with if="..." attributes.
 * Non-if siblings break the group. A group must have at least 2 elements.
 */
export function detectVariantGroups(parent: HTMLElement): VariantGroup[] {
    const children = getElementChildren(parent);
    const groups: VariantGroup[] = [];
    let currentGroup: { elements: HTMLElement[]; conditions: string[] } | null =
        null;

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
            if (currentGroup && currentGroup.elements.length >= 2) {
                groups.push({
                    ...currentGroup,
                    containerParent: parent,
                });
            }
            currentGroup = null;
        }
    }

    if (currentGroup && currentGroup.elements.length >= 2) {
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

                if (!pathToDimension.has(pathKey)) {
                    const values = new Set<string>();
                    let isBoolean = false;
                    if (token.operator === '==' && token.comparedValue != null) {
                        values.add(token.comparedValue);
                    } else if (token.isNegated || !token.operator) {
                        isBoolean = true;
                        values.add('true');
                        values.add('false');
                    }
                    pathToDimension.set(pathKey, {
                        values,
                        isBoolean,
                        isComputed: token.isComputed,
                    });
                } else {
                    const dim = pathToDimension.get(pathKey)!;
                    if (token.operator === '==' && token.comparedValue != null) {
                        dim.values.add(token.comparedValue);
                    } else if (token.isNegated || !token.operator) {
                        dim.isBoolean = true;
                        dim.values.add('true');
                        dim.values.add('false');
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

function getVariantPropertiesForCondition(
    condition: string,
    dimensions: DimensionInfo[],
): Record<string, string> {
    const result: Record<string, string> = {};
    const tokens = tokenizeCondition(condition);

    for (const dim of dimensions) {
        const pathKey = dim.tagPath.join('.');
        const matchingToken = tokens.find(
            (t) => t.path.join('.') === pathKey,
        );
        if (matchingToken) {
            if (matchingToken.operator === '==' && matchingToken.comparedValue != null) {
                result[dim.name] = matchingToken.comparedValue;
            } else {
                result[dim.name] = matchingToken.isNegated ? 'false' : 'true';
            }
        }
    }
    return result;
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
): SynthesizedVariant {
    const warnings: string[] = [];
    const { dimensions, warnings: dimWarnings } = classifyDimensions(
        [{ elements: group.elements, conditions: group.conditions }],
        contractTags,
    );
    warnings.push(...dimWarnings);

    const componentPropertyDefinitions: Record<
        string,
        { type: 'VARIANT'; variantOptions: string[] }
    > = {};
    for (const dim of dimensions) {
        componentPropertyDefinitions[dim.name] = {
            type: 'VARIANT',
            variantOptions: Array.from(dim.values).sort(),
        };
    }

    const dimensionNames = dimensions.map((d) => d.name).join(', ');
    const componentSetName = dimensionNames
        ? `${dimensionNames} variants`
        : 'variants';

    const componentSetDomPath = buildDomPath(group.containerParent, body);
    const componentSetId = generateNodeId(componentSetDomPath, [
        'variant-set',
        ...group.conditions,
    ]);

    const components: ImportIRNode[] = [];
    for (let i = 0; i < group.elements.length; i++) {
        const element = group.elements[i]!;
        const condition = group.conditions[i]!;
        const variantProps = getVariantPropertiesForCondition(
            condition,
            dimensions,
        );
        const variantName = Object.entries(variantProps)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');

        const childNode = buildChildNode(element);
        const compDomPath = buildDomPath(element, body);
        const compId = generateNodeId(compDomPath, [
            'variant',
            condition,
            ...getSemanticAnchors(element),
        ]);

        components.push({
            id: compId,
            sourcePath: 'variant-synthesizer',
            kind: 'COMPONENT',
            name: variantName,
            variantProperties: variantProps,
            children: [childNode],
        });
    }

    const componentSet: ImportIRNode = {
        id: componentSetId,
        sourcePath: 'variant-synthesizer',
        kind: 'COMPONENT_SET',
        name: componentSetName,
        componentPropertyDefinitions,
        children: components,
    };

    const firstComponentId = components[0]!.id;
    const instanceBindings: ImportIRNode['bindings'] = [];
    for (const dim of dimensions) {
        const tag = findContractTag(contractTags, dim.tagPath);
        if (tag) {
            const binding: LayerBinding = {
                pageContractPath,
                jayPageSectionId,
                tagPath: dim.tagPath,
                property: dim.name,
            };
            instanceBindings.push({ kind: 'layer', binding });
        }
    }

    const instanceDomPath = buildDomPath(group.containerParent, body);
    const instanceId = generateNodeId(instanceDomPath, [
        'variant-instance',
        ...group.conditions,
    ]);

    const instance: ImportIRNode = {
        id: instanceId,
        sourcePath: 'variant-synthesizer',
        kind: 'INSTANCE',
        name: componentSetName,
        mainComponentId: firstComponentId,
        bindings: instanceBindings,
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
        bindings: layerBindings.length > 0 ? layerBindings.map((b) => ({ kind: 'layer' as const, binding: b })) : undefined,
        children: childNode ? [childNode] : [],
    };
}
