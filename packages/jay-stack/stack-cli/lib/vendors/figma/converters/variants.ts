import type { FigmaVendorDocument, ContractTag } from '@jay-framework/editor-protocol';
import type { ConversionContext, BindingAnalysis } from '../types';
import { parseDataTypeString } from '../computed-style-enricher';
import { HIDDEN_VARIANT_MARKER } from '../import-ir-to-figma-vendor-doc';

/**
 * Returns the set of valid variant values for a contract tag, or null if the
 * type cannot be enumerated (e.g. string, number).  The contract is the source
 * of truth — only values defined in the contract should appear in exported
 * jay-html conditions.
 */
function getValidContractValues(contractTag: ContractTag): Set<string> | null {
    const dt = parseDataTypeString(contractTag.dataType);
    if (dt.kind === 'boolean') return new Set(['true', 'false']);
    if (dt.kind === 'enum' && dt.enumValues) return new Set(dt.enumValues);
    return null;
}

/**
 * Check whether a Figma variant value is valid for export: it must either
 * exist in the contract's valid value set, or (when the type is not
 * enumerable) it must not be a pseudo-CSS selector (contains ':').
 */
function isValidVariantValue(value: string, validValues: Set<string> | null): boolean {
    if (validValues) return validValues.has(value);
    return !value.includes(':');
}

function isHiddenVariant(node: FigmaVendorDocument): boolean {
    return node.pluginData?.[HIDDEN_VARIANT_MARKER] === 'true';
}

/**
 * Collect variant component nodes from a resolved node, excluding any
 * that were marked as hidden during import.
 */
function collectNonHiddenVariantNodes(node: FigmaVendorDocument): FigmaVendorDocument[] {
    if (node.variants && node.variants.length > 0) {
        return node.variants.filter((v) => !isHiddenVariant(v));
    }
    if (node.children) {
        return node.children.filter((c) => c.type === 'COMPONENT' && !isHiddenVariant(c));
    }
    return [];
}

/**
 * Gets all variant values for a component set's properties.
 * Only values defined in the contract tag are included.
 */
export function getComponentVariantValues(
    node: FigmaVendorDocument,
    propertyBindings: Array<{ property: string; contractTag: ContractTag }>,
    componentSetIndex?: Map<string, FigmaVendorDocument>,
): Map<string, string[]> {
    const values = new Map<string, string[]>();

    const validValuesByProperty = new Map<string, Set<string> | null>();
    for (const binding of propertyBindings) {
        validValuesByProperty.set(binding.property, getValidContractValues(binding.contractTag));
    }

    const filterValues = (propName: string, variantValues: string[]): string[] => {
        const valid = validValuesByProperty.get(propName);
        return variantValues.filter((v) => isValidVariantValue(v, valid));
    };

    // For INSTANCE nodes without inline variant data, resolve via componentSetIndex
    let resolvedNode = node;
    if (
        !node.componentPropertyDefinitions &&
        (!node.variants || node.variants.length === 0) &&
        node.mainComponentId &&
        componentSetIndex
    ) {
        const componentSet = componentSetIndex.get(node.mainComponentId);
        if (componentSet) {
            resolvedNode = componentSet;
        }
    }

    // Collect values from non-hidden variant components. This ensures
    // synthetic hidden values (injected during import) are excluded without
    // relying on magic value strings — hidden components carry a pluginData marker.
    const variantNodes = collectNonHiddenVariantNodes(resolvedNode);

    if (variantNodes.length > 0) {
        const propertyValuesMap = new Map<string, Set<string>>();
        for (const variant of variantNodes) {
            const props = variant.variantProperties;
            if (!props) continue;
            for (const binding of propertyBindings) {
                const propValue = props[binding.property];
                if (!propValue) continue;
                const valid = validValuesByProperty.get(binding.property);
                if (!isValidVariantValue(propValue, valid)) continue;
                if (!propertyValuesMap.has(binding.property)) {
                    propertyValuesMap.set(binding.property, new Set());
                }
                propertyValuesMap.get(binding.property)!.add(propValue);
            }
        }
        for (const [prop, valueSet] of propertyValuesMap) {
            if (valueSet.size > 0) values.set(prop, Array.from(valueSet));
        }
    }

    // Fallback: use variantOptions from componentPropertyDefinitions when
    // no variant component nodes are available (e.g. INSTANCE without
    // componentSetIndex resolution).
    if (values.size === 0 && resolvedNode.componentPropertyDefinitions) {
        for (const binding of propertyBindings) {
            const propDef = resolvedNode.componentPropertyDefinitions[binding.property];
            if (propDef && propDef.type === 'VARIANT' && propDef.variantOptions) {
                const filtered = filterValues(binding.property, propDef.variantOptions);
                if (filtered.length > 0) {
                    values.set(binding.property, filtered);
                }
            }
        }
    }

    return values;
}

/**
 * Checks if a variant property should use boolean syntax (if="prop" / if="!prop").
 *
 * Returns true when all variant values (excluding wildcards) are "true" and/or
 * "false".  This covers both:
 * - Explicit boolean contract properties (dataType: boolean)
 * - Truthy checks on non-boolean properties (e.g. if="brand.name" imported as name=true)
 *
 * Hidden variant values are already excluded by getComponentVariantValues.
 * When no non-wildcard values remain, falls back to contract dataType.
 */
function isBooleanVariant(values: string[], contractTag: ContractTag): boolean {
    const nonWildcard = values.filter((v) => v !== '*');
    if (nonWildcard.length === 0) return contractTag.dataType === 'boolean';
    if (nonWildcard.every((v) => v === 'true' || v === 'false')) return true;
    return false;
}

/**
 * Generates all permutations of variant property values
 */
export function generatePermutations(
    propertyValues: Map<string, string[]>,
    bindings: Array<{ property: string; tagPath: string; contractTag: ContractTag }>,
): Array<Array<{ property: string; tagPath: string; value: string; isBoolean: boolean }>> {
    const properties = Array.from(propertyValues.entries());
    if (properties.length === 0) {
        return [];
    }

    const permutations: Array<
        Array<{ property: string; tagPath: string; value: string; isBoolean: boolean }>
    > = [];

    function generate(
        index: number,
        current: Array<{ property: string; tagPath: string; value: string; isBoolean: boolean }>,
    ) {
        if (index === properties.length) {
            permutations.push([...current]);
            return;
        }

        const [propName, propValues] = properties[index];
        const binding = bindings.find((b) => b.property === propName);
        if (!binding) return;

        // Check if this is a boolean variant using BOTH Figma values AND contract tag
        const isBoolean = isBooleanVariant(propValues, binding.contractTag);

        for (const value of propValues) {
            current.push({ property: propName, tagPath: binding.tagPath, value, isBoolean });
            generate(index + 1, current);
            current.pop();
        }
    }

    generate(0, []);
    return permutations;
}

/**
 * Finds the variant component that matches the given property values
 *
 * When property bindings are on an INSTANCE node, the serialization includes:
 * - node.variants: Array of all variants from the component set
 * - each variant has variantProperties: { property: value }
 *
 * This function finds the matching variant by comparing property values.
 *
 * Note: Pseudo-CSS variants (with ':' in values) are filtered out before this function
 * is called, so only actual Jay variants are matched here.
 */
export function findComponentVariant(
    node: FigmaVendorDocument,
    permutation: Array<{ property: string; value: string }>,
): FigmaVendorDocument {
    // Use variants array if available, otherwise check children (for COMPONENT_SET nodes)
    const variants =
        node.variants && node.variants.length > 0
            ? node.variants
            : node.type === 'COMPONENT_SET' && node.children
              ? node.children.filter((c) => c.type === 'COMPONENT')
              : null;

    if (!variants || variants.length === 0) {
        throw new Error(
            `Node "${node.name}" has no variants array - cannot find variant component`,
        );
    }

    const targetProps = new Map<string, string>();
    for (const { property, value } of permutation) {
        targetProps.set(property, value);
    }

    const matchingVariant = variants.find((variant) => {
        if (!variant.variantProperties) {
            return false;
        }

        for (const [prop, value] of targetProps) {
            if (variant.variantProperties[prop] !== value) {
                return false;
            }
        }

        for (const [prop, value] of Object.entries(variant.variantProperties)) {
            if (targetProps.has(prop) && targetProps.get(prop) !== value) {
                return false;
            }
        }

        return true;
    });

    if (!matchingVariant) {
        console.log(
            `No matching variant found for "${node.name}" with properties:`,
            Object.fromEntries(targetProps),
            '\nAvailable variants:',
            variants.map((v) => v.variantProperties),
            '\nUsing first variant as fallback',
        );
        return variants[0] || node;
    }

    return matchingVariant;
}

/**
 * Builds a condition string for a variant permutation
 * Handles both boolean and enum variant properties
 */
/**
 * Extract variant properties from a component node.
 * Tries `variantProperties` first, falls back to parsing from the
 * Figma component name (e.g. "buttonVariant=primary, isDisabled=false").
 */
function resolveVariantProperties(node: FigmaVendorDocument): Record<string, string> | null {
    if (node.variantProperties) return node.variantProperties;
    if (node.name?.includes('=')) {
        const props: Record<string, string> = {};
        for (const part of node.name.split(',')) {
            const eq = part.indexOf('=');
            if (eq > 0) props[part.substring(0, eq).trim()] = part.substring(eq + 1).trim();
        }
        return Object.keys(props).length > 0 ? props : null;
    }
    return null;
}

const EXPRESSION_VALUE_RE = /^(>=|<=|>|<)\s/;

export function buildVariantCondition(
    permutation: Array<{ property: string; tagPath: string; value: string; isBoolean: boolean }>,
): string {
    const conditions: string[] = [];
    for (const { tagPath, value, isBoolean } of permutation) {
        if (value === '*') continue;

        if (isBoolean) {
            if (value === 'true') {
                conditions.push(tagPath);
            } else {
                conditions.push(`${tagPath} === false`);
            }
        } else if (value.startsWith('!')) {
            conditions.push(`${tagPath} != ${value.slice(1)}`);
        } else if (EXPRESSION_VALUE_RE.test(value)) {
            conditions.push(`${tagPath} ${value}`);
        } else {
            conditions.push(`${tagPath} == ${value}`);
        }
    }

    return conditions.join(' && ');
}

/**
 * Converts a variant node to Jay HTML with if conditions
 *
 * Handles both boolean and enum variant properties:
 * - Boolean properties (true/false) → `if="prop"` or `if="!prop"`
 * - Enum properties → `if="prop == value"`
 *
 * Structure:
 * 1. Outer wrapper div - has the instance node's Frame styling (position, size, layout, etc.)
 * 2. Inner if divs - one per variant permutation
 * 3. Variant children - inside each if div
 */
export function convertVariantNode(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
    convertNodeToJayHtml: (node: FigmaVendorDocument, context: ConversionContext) => string,
): string {
    const indent = '  '.repeat(context.indentLevel);
    const innerIndent = '  '.repeat(context.indentLevel + 1);

    // 1. Get all variant property values (resolve via componentSetIndex if needed)
    const propertyValues = getComponentVariantValues(
        node,
        analysis.propertyBindings,
        context.componentSetIndex,
    );

    // Resolve INSTANCE to COMPONENT_SET for variant lookup
    let resolvedNode = node;
    if (
        (!node.variants || node.variants.length === 0) &&
        node.mainComponentId &&
        context.componentSetIndex
    ) {
        const componentSet = context.componentSetIndex.get(node.mainComponentId);
        if (componentSet) {
            resolvedNode = componentSet;
        }
    }

    // 2. Get actual variant components instead of generating all permutations.
    // This preserves the original condition set from import rather than
    // creating a Cartesian product explosion of all dimension values.
    const variantComponents =
        resolvedNode.variants && resolvedNode.variants.length > 0
            ? resolvedNode.variants
            : resolvedNode.children?.filter((c) => c.type === 'COMPONENT') ?? [];

    // Build per-property valid value sets from the contract
    const validValuesByProperty = new Map<string, Set<string> | null>();
    for (const binding of analysis.propertyBindings) {
        validValuesByProperty.set(binding.property, getValidContractValues(binding.contractTag));
    }

    // Keep only non-hidden variants whose property values are all valid per
    // the contract.  Hidden variants carry a pluginData marker from import.
    // Wildcard '*' means "unconstrained" and is always allowed
    // (buildVariantCondition skips it when building the if-expression).
    const realVariants = variantComponents.filter((v) => {
        if (isHiddenVariant(v)) return false;
        const props = resolveVariantProperties(v);
        if (!props) return false;
        for (const binding of analysis.propertyBindings) {
            const val = props[binding.property];
            if (!val || val === '*') continue;
            const valid = validValuesByProperty.get(binding.property);
            if (!isValidVariantValue(val, valid)) return false;
        }
        return true;
    });

    if (realVariants.length === 0) {
        throw new Error(
            `No variant components found for "${node.name}" - check component set structure`,
        );
    }

    // 3. Build the variant if divs from actual components
    let variantHtml = '';
    for (const variantNode of realVariants) {
        const variantProps = resolveVariantProperties(variantNode);
        if (!variantProps) continue;

        const permutation: Array<{
            property: string;
            tagPath: string;
            value: string;
            isBoolean: boolean;
        }> = [];
        for (const binding of analysis.propertyBindings) {
            const value = variantProps[binding.property];
            if (!value) continue;
            const allValues = propertyValues.get(binding.property) || [];
            const isBoolean = isBooleanVariant(allValues, binding.contractTag);
            permutation.push({
                property: binding.property,
                tagPath: binding.tagPath,
                value,
                isBoolean,
            });
        }

        const conditions = buildVariantCondition(permutation);
        if (!conditions) continue;

        variantHtml += `${innerIndent}<div if="${conditions}">\n`;

        const variantContext: ConversionContext = {
            ...context,
            indentLevel: context.indentLevel + 2,
        };

        if (variantNode.children && variantNode.children.length > 0) {
            for (const child of variantNode.children) {
                variantHtml += convertNodeToJayHtml(child, variantContext);
            }
        }

        variantHtml += `${innerIndent}</div>\n`;
    }

    // 4. Determine ref attribute from analysis
    let refAttr = '';
    if (analysis.refPath) {
        refAttr = ` ref="${analysis.refPath}"`;
    } else if (analysis.dualPath) {
        refAttr = ` ref="${analysis.dualPath}"`;
    } else if (analysis.interactiveVariantPath) {
        refAttr = ` ref="${analysis.interactiveVariantPath}"`;
    }

    // Variant wrappers are transparent containers for conditional content.
    // Always use display:contents so children participate in the parent's
    // layout flow directly -- fixed pixel sizes from Figma would break the
    // responsive CSS layout.
    return (
        `${indent}<div${refAttr} style="display: contents;">\n` + variantHtml + `${indent}</div>\n`
    );
}
