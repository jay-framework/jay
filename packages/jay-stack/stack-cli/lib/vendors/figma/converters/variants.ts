import type { FigmaVendorDocument, ContractTag } from '@jay-framework/editor-protocol';
import type { ConversionContext, BindingAnalysis } from '../types';
import {
    getPositionStyle,
    getFrameSizeStyles,
    getCommonStyles,
    getBorderRadius,
    getAutoLayoutStyles,
    getOverflowStyles,
    getBackgroundFillsStyle,
    getStrokeStyles,
} from '../utils';

/**
 * Gets all variant values for a component set's properties
 * Returns a map of property name to array of possible values
 *
 * Works with both:
 * - Component nodes (componentPropertyDefinitions on the node itself)
 * - Instance nodes (componentPropertyDefinitions + variants array serialized from component set)
 *
 * Filters out pseudo-CSS class variants (values containing ':') as these are handled
 * via CSS display toggling, not Jay-HTML if conditions.
 */
export function getComponentVariantValues(
    node: FigmaVendorDocument,
    propertyBindings: Array<{ property: string; contractTag: ContractTag }>,
    componentSetIndex?: Map<string, FigmaVendorDocument>,
): Map<string, string[]> {
    const values = new Map<string, string[]>();

    const filterPseudoVariants = (variantValues: string[]): string[] => {
        return variantValues.filter((value) => !value.includes(':'));
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

    if (resolvedNode.componentPropertyDefinitions) {
        for (const binding of propertyBindings) {
            const propDef = resolvedNode.componentPropertyDefinitions[binding.property];
            if (propDef && propDef.type === 'VARIANT' && propDef.variantOptions) {
                const filtered = filterPseudoVariants(propDef.variantOptions);
                if (filtered.length > 0) {
                    values.set(binding.property, filtered);
                }
            }
        }
    }

    if (values.size === 0 && resolvedNode.variants && resolvedNode.variants.length > 0) {
        const propertyValuesMap = new Map<string, Set<string>>();

        for (const variant of resolvedNode.variants) {
            if (variant.variantProperties) {
                for (const binding of propertyBindings) {
                    const propValue = variant.variantProperties[binding.property];
                    if (propValue && !propValue.includes(':')) {
                        if (!propertyValuesMap.has(binding.property)) {
                            propertyValuesMap.set(binding.property, new Set());
                        }
                        propertyValuesMap.get(binding.property)!.add(propValue);
                    }
                }
            }
        }

        for (const [prop, valueSet] of propertyValuesMap) {
            if (valueSet.size > 0) {
                values.set(prop, Array.from(valueSet));
            }
        }
    }

    // If resolvedNode is COMPONENT_SET (from index lookup) and we need variants,
    // build them from children
    if (values.size === 0 && resolvedNode.children && resolvedNode.type === 'COMPONENT_SET') {
        const propertyValuesMap = new Map<string, Set<string>>();

        for (const child of resolvedNode.children) {
            if (child.type === 'COMPONENT' && child.variantProperties) {
                for (const binding of propertyBindings) {
                    const propValue = child.variantProperties[binding.property];
                    if (propValue && !propValue.includes(':')) {
                        if (!propertyValuesMap.has(binding.property)) {
                            propertyValuesMap.set(binding.property, new Set());
                        }
                        propertyValuesMap.get(binding.property)!.add(propValue);
                    }
                }
            }
        }

        for (const [prop, valueSet] of propertyValuesMap) {
            if (valueSet.size > 0) {
                values.set(prop, Array.from(valueSet));
            }
        }
    }

    return values;
}

/**
 * Checks if a variant property is boolean based on:
 * 1. Contract tag dataType is "boolean"
 * 2. Figma variant values are exactly "true" and "false"
 *
 * This dual check ensures we only use boolean syntax when the contract
 * explicitly declares the property as boolean AND Figma values match.
 */
function isBooleanVariant(values: string[], contractTag: ContractTag): boolean {
    // Check contract tag dataType first - this is the source of truth
    if (contractTag.dataType !== 'boolean') {
        return false;
    }

    // Then verify Figma values match boolean pattern
    if (values.length !== 2) {
        return false;
    }
    const sortedValues = [...values].sort();
    return sortedValues[0] === 'false' && sortedValues[1] === 'true';
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
function buildVariantCondition(
    permutation: Array<{ property: string; tagPath: string; value: string; isBoolean: boolean }>,
): string {
    const conditions = permutation.map(({ tagPath, value, isBoolean }) => {
        if (isBoolean) {
            // For boolean properties, use simpler syntax
            if (value === 'true') {
                return tagPath;
            } else {
                return `!${tagPath}`;
            }
        } else {
            // For enum properties, use equality check
            return `${tagPath} == ${value}`;
        }
    });

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

    // 2. Generate all permutations
    const permutations = generatePermutations(propertyValues, analysis.propertyBindings);
    if (permutations.length === 0) {
        throw new Error(
            `No permutations generated for variant node "${node.name}" - check property definitions`,
        );
    }

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

    // 3. Build the variant if divs
    let variantHtml = '';
    for (const permutation of permutations) {
        // Build if condition (handles both boolean and enum properties)
        const conditions = buildVariantCondition(permutation);

        // Find variant component (use resolvedNode which may be the COMPONENT_SET)
        const variantNode = findComponentVariant(resolvedNode, permutation);

        // Convert variant with if condition
        variantHtml += `${innerIndent}<div if="${conditions}">\n`;

        const variantContext: ConversionContext = {
            ...context,
            indentLevel: context.indentLevel + 2, // +2 because we're inside wrapper and if div
        };

        // Convert variant node's children
        if (variantNode.children && variantNode.children.length > 0) {
            for (const child of variantNode.children) {
                variantHtml += convertNodeToJayHtml(child, variantContext);
            }
        }

        variantHtml += `${innerIndent}</div>\n`;
    }

    // 4. Build styles for the outer wrapper (the instance node's Frame styling)
    // This wrapper is positioned once and contains all variant permutations
    const positionStyle = getPositionStyle(node);
    const frameSizeStyles = getFrameSizeStyles(node);
    const backgroundStyle = getBackgroundFillsStyle(node);
    const borderRadius = getBorderRadius(node);
    const strokeStyles = getStrokeStyles(node);
    const flexStyles = getAutoLayoutStyles(node);
    const overflowStyles = getOverflowStyles(node);
    const commonStyles = getCommonStyles(node);

    const wrapperStyleAttr = `${positionStyle}${frameSizeStyles}${backgroundStyle}${strokeStyles}${borderRadius}${overflowStyles}${commonStyles}${flexStyles}box-sizing: border-box;`;

    // Determine ref attribute from analysis (checked in binding analysis phase)
    let refAttr = '';
    if (analysis.refPath) {
        refAttr = ` ref="${analysis.refPath}"`;
    } else if (analysis.dualPath) {
        refAttr = ` ref="${analysis.dualPath}"`;
    } else if (analysis.interactiveVariantPath) {
        // Variant property that is also interactive (type: [variant, interactive])
        refAttr = ` ref="${analysis.interactiveVariantPath}"`;
    }

    // 5. Wrap everything in the outer container with Frame styling
    return (
        `${indent}<div id="${node.id}" data-figma-id="${node.id}" data-figma-type="variant-container"${refAttr} style="${wrapperStyleAttr}">\n` +
        variantHtml +
        `${indent}</div>\n`
    );
}
