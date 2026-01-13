import { Vendor, VendorConversionResult } from '../types';
import type { FigmaVendorDocument, ProjectPage, Plugin } from '@jay-framework/editor-protocol';
import {
    getPositionStyle,
    getNodeSizeStyles,
    getCommonStyles,
    getBorderRadius,
    getAutoLayoutStyles,
    getOverflowStyles,
    getBackgroundFillsStyle,
    getStrokeStyles,
    getFrameSizeStyles,
} from './utils';
import { convertTextNodeToHtml } from './converters/text';
import { convertImageNodeToHtml, extractStaticImageUrl } from './converters/image';
import { convertRectangleToHtml } from './converters/rectangle';
import { convertEllipseToHtml } from './converters/ellipse';
import { convertVectorToHtml } from './converters/vector';
import type { ConversionContext, BindingAnalysis } from './types';
import {
    getBindingsData,
    analyzeBindings,
    validateBindings,
} from './binding-analysis';

/**
 * Figma Vendor Implementation
 *
 * This converts Figma FigmaVendorDocument documents to Jay HTML body content.
 *
 * The FigmaVendorDocument type is imported from @jay-framework/editor-protocol,
 * which is the single source of truth for the vendor document structure.
 */

/**
 * Converts a repeater node to Jay HTML with forEach
 */
function convertRepeaterNode(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
): string {
    const { repeaterPath, trackByKey } = analysis;
    const indent = '  '.repeat(context.indentLevel);

    // Push repeater path to context stack
    const newContext: ConversionContext = {
        ...context,
        repeaterPathStack: [...context.repeaterPathStack, repeaterPath!.split('.')],
        indentLevel: context.indentLevel + 1,
    };

    // Convert only the first child - it's the template that gets repeated
    let childrenHtml = '';
    if (node.children && node.children.length > 0) {
        childrenHtml = convertNodeToJayHtml(node.children[0], newContext);
    }

    // Build forEach HTML
    return (
        `${indent}<div forEach="${repeaterPath}" trackBy="${trackByKey}">\n` +
        childrenHtml +
        `${indent}</div>\n`
    );
}

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
function getComponentVariantValues(
    node: FigmaVendorDocument,
    propertyBindings: Array<{ property: string }>,
): Map<string, string[]> {
    const values = new Map<string, string[]>();

    // Helper to filter out pseudo-CSS variants
    const filterPseudoVariants = (variantValues: string[]): string[] => {
        return variantValues.filter(value => !value.includes(':'));
    };

    // Extract from node.componentPropertyDefinitions if available
    if (node.componentPropertyDefinitions) {
        for (const binding of propertyBindings) {
            const propDef = node.componentPropertyDefinitions[binding.property];
            if (propDef && propDef.type === 'VARIANT' && propDef.variantOptions) {
                const filtered = filterPseudoVariants(propDef.variantOptions);
                if (filtered.length > 0) {
                    values.set(binding.property, filtered);
                }
            }
        }
    }

    // If we didn't get values from componentPropertyDefinitions,
    // try to extract from the variants array
    if (values.size === 0 && node.variants && node.variants.length > 0) {
        // Build set of unique values for each property from all variants
        const propertyValuesMap = new Map<string, Set<string>>();
        
        for (const variant of node.variants) {
            if (variant.variantProperties) {
                for (const binding of propertyBindings) {
                    const propValue = variant.variantProperties[binding.property];
                    // Skip pseudo-CSS variants (values containing ':')
                    if (propValue && !propValue.includes(':')) {
                        if (!propertyValuesMap.has(binding.property)) {
                            propertyValuesMap.set(binding.property, new Set());
                        }
                        propertyValuesMap.get(binding.property)!.add(propValue);
                    }
                }
            }
        }
        
        // Convert sets to arrays
        for (const [prop, valueSet] of propertyValuesMap) {
            if (valueSet.size > 0) {
                values.set(prop, Array.from(valueSet));
            }
        }
    }

    return values;
}

/**
 * Generates all permutations of variant property values
 */
function generatePermutations(
    propertyValues: Map<string, string[]>,
    bindings: Array<{ property: string; tagPath: string }>,
): Array<Array<{ property: string; tagPath: string; value: string }>> {
    const properties = Array.from(propertyValues.entries());
    if (properties.length === 0) {
        return [];
    }

    const permutations: Array<Array<{ property: string; tagPath: string; value: string }>> = [];

    function generate(index: number, current: Array<{ property: string; tagPath: string; value: string }>) {
        if (index === properties.length) {
            permutations.push([...current]);
            return;
        }

        const [propName, propValues] = properties[index];
        const binding = bindings.find((b) => b.property === propName);
        if (!binding) return;

        for (const value of propValues) {
            current.push({ property: propName, tagPath: binding.tagPath, value });
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
function findComponentVariant(
    node: FigmaVendorDocument,
    permutation: Array<{ property: string; value: string }>,
): FigmaVendorDocument {
    // If node has variants array (serialized from component set)
    if (!node.variants || node.variants.length === 0) {
        console.warn(`Node "${node.name}" has no variants array, using node itself`);
        return node;
    }

    // Build target property map from permutation
    const targetProps = new Map<string, string>();
    for (const { property, value } of permutation) {
        targetProps.set(property, value);
    }

    // Find matching variant
    const matchingVariant = node.variants.find((variant) => {
        if (!variant.variantProperties) {
            return false;
        }

        // Check if all target properties match
        for (const [prop, value] of targetProps) {
            if (variant.variantProperties[prop] !== value) {
                return false;
            }
        }

        // Also verify no extra properties that differ
        // (This ensures exact match for component sets with >2 properties)
        for (const [prop, value] of Object.entries(variant.variantProperties)) {
            if (targetProps.has(prop) && targetProps.get(prop) !== value) {
                return false;
            }
        }

        return true;
    });

    if (!matchingVariant) {
        console.warn(
            `No matching variant found for "${node.name}" with properties:`,
            Object.fromEntries(targetProps),
            '\nAvailable variants:',
            node.variants.map((v) => v.variantProperties),
        );
        // Fallback to first variant or the node itself
        return node.variants[0] || node;
    }

    return matchingVariant;
}

/**
 * Converts a variant node to Jay HTML with if conditions
 */
function convertVariantNode(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
): string {
    const indent = '  '.repeat(context.indentLevel);
    let html = '';
    // 1. Get all variant property values
    const propertyValues = getComponentVariantValues(node, analysis.propertyBindings);
    // 2. Generate all permutations
    const permutations = generatePermutations(propertyValues, analysis.propertyBindings);
    if (permutations.length === 0) {
        console.warn(`No permutations generated for variant node: ${node.name}`);
        return `${indent}<!-- Variant node "${node.name}" has no permutations -->\n`;
    }

    // 3. Convert each permutation
    for (const permutation of permutations) {
        // Build if condition
        const conditions = permutation
            .map(({ tagPath, value }) => `${tagPath} == ${value}`)
            .join(' && ');

        // Find variant component
        const variantNode = findComponentVariant(node, permutation);

        // Convert variant
        html += `${indent}<div if="${conditions}">\n`;

        const variantContext: ConversionContext = {
            ...context,
            indentLevel: context.indentLevel + 1,
        };

        // Convert variant node's children
        if (variantNode.children && variantNode.children.length > 0) {
            for (const child of variantNode.children) {
                html += convertNodeToJayHtml(child, variantContext);
            }
        }

        html += `${indent}</div>\n`;
    }

    return html;
}

/**
 * Converts a regular node (non-repeater, non-variant) to Jay HTML
 */
function convertRegularNode(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
): string {
    const indent = '  '.repeat(context.indentLevel);
    const { type, children, pluginData } = node;

    const semanticHtml = pluginData?.['semanticHtml'];

    // For text nodes, handle specially
    if (type === 'TEXT') {
        const dynamicContent = analysis.dynamicContentPath ? `{${analysis.dynamicContentPath}}` : '';
        const refAttr = analysis.refPath ? ` ref="${analysis.refPath}"` : '';
        const dualContent = analysis.dualPath ? `{${analysis.dualPath}}` : '';
        const dualRef = analysis.dualPath ? ` ref="${analysis.dualPath}"` : '';

        // Build attribute string
        let attributesHtml = '';
        for (const [attr, tagPath] of analysis.attributes) {
            attributesHtml += ` ${attr}="{${tagPath}}"`;
        }

        return convertTextNodeToHtml(
            node,
            indent,
            dynamicContent || dualContent,
            refAttr || dualRef,
            attributesHtml,
        );
    }

    // For image semantic nodes, handle specially
    if (semanticHtml === 'img') {
        // Extract src and alt bindings
        let srcBinding: string | undefined;
        let altBinding: string | undefined;
        
        for (const [attr, tagPath] of analysis.attributes) {
            if (attr === 'src') {
                srcBinding = `{${tagPath}}`;
            } else if (attr === 'alt') {
                altBinding = `{${tagPath}}`;
            }
        }

        // Check for static image (no src binding)
        let staticImageUrl: string | undefined;
        if (!srcBinding) {
            staticImageUrl = extractStaticImageUrl(node);
        }

        const refAttr = analysis.refPath ? ` ref="${analysis.refPath}"` : 
                       (analysis.dualPath ? ` ref="${analysis.dualPath}"` : '');

        return convertImageNodeToHtml(
            node,
            indent,
            srcBinding,
            altBinding,
            refAttr,
            staticImageUrl,
        );
    }

    // Get position, size, and common styles
    const positionStyle = getPositionStyle(node);
    const sizeStyles = getNodeSizeStyles(node);
    const commonStyles = getCommonStyles(node);

    // For frames, build full styling
    let styleAttr = '';
    if (type === 'FRAME') {
        const backgroundStyle = getBackgroundFillsStyle(node);
        const borderRadius = getBorderRadius(node);
        const strokeStyles = getStrokeStyles(node);
        const flexStyles = getAutoLayoutStyles(node);
        const overflowStyles = getOverflowStyles(node);
        const frameSizeStyles = getFrameSizeStyles(node);

        styleAttr = `${positionStyle}${frameSizeStyles}${backgroundStyle}${strokeStyles}${borderRadius}${overflowStyles}${commonStyles}${flexStyles}box-sizing: border-box;`;
    } else {
        styleAttr = `${positionStyle}${sizeStyles}${commonStyles}`;
    }

    // Build HTML attributes
    const tag = semanticHtml || 'div';
    let htmlAttrs = `data-figma-id="${node.id}" data-figma-type="${type.toLowerCase()}" style="${styleAttr}"`;

    // Add ref attribute
    if (analysis.refPath) {
        htmlAttrs += ` ref="${analysis.refPath}"`;
    } else if (analysis.dualPath) {
        htmlAttrs += ` ref="${analysis.dualPath}"`;
    }

    // Add other attributes (like src, href, value, etc.)
    for (const [attr, tagPath] of analysis.attributes) {
        htmlAttrs += ` ${attr}="{${tagPath}}"`;
    }

    // Handle based on node type
    if (type === 'RECTANGLE') {
        return convertRectangleToHtml(node, indent);
    } else if (type === 'ELLIPSE') {
        return convertEllipseToHtml(node, indent);
    } else if (
        type === 'VECTOR' ||
        type === 'STAR' ||
        type === 'POLYGON' ||
        type === 'LINE' ||
        type === 'BOOLEAN_OPERATION'
    ) {
        return convertVectorToHtml(node, indent);
    } else if (children && children.length > 0) {
        // Container with children
        let html = `${indent}<${tag} ${htmlAttrs}>\n`;
        html += `${indent}  <!-- ${node.name} -->\n`;

        const childContext: ConversionContext = {
            ...context,
            indentLevel: context.indentLevel + 1,
        };

        for (const child of children) {
            html += convertNodeToJayHtml(child, childContext);
        }

        html += `${indent}</${tag}>\n`;
        return html;
    } else {
        // Leaf node
        return `${indent}<!-- ${node.name} (${type}) -->\n`;
    }
}
/**
 * Main converter for Figma nodes to Jay HTML
 * Implements the conversion pipeline with binding analysis
 */
function convertNodeToJayHtml(node: FigmaVendorDocument, context: ConversionContext): string {
    const { name, type, children, pluginData } = node;
    // Extract Jay-specific data from pluginData
    const isJPage = pluginData?.['jpage'] === 'true';
    const urlRoute = pluginData?.['urlRoute'];

    // Collect font family if this is a TEXT node
    if (type === 'TEXT' && node.fontName) {
        if (typeof node.fontName === 'object' && node.fontName.family) {
            context.fontFamilies.add(node.fontName.family);
        }
    }

    const indent = '  '.repeat(context.indentLevel);

    // Handle Jay Page sections (don't process bindings for top-level sections)
    if (type === 'SECTION' && isJPage) {
        let html = `${indent}<section data-figma-id="${node.id}" data-page-url="${urlRoute || ''}">\n`;
        html += `${indent}  <!-- Jay Page: ${name} -->\n`;

        if (children && children.length > 0) {
            const childContext: ConversionContext = {
                ...context,
                indentLevel: context.indentLevel + 1,
            };
            for (const child of children) {
                html += convertNodeToJayHtml(child, childContext);
            }
        }

        html += `${indent}</section>\n`;
        return html;
    }

    // 1. Get bindings from plugin data
    const bindings = getBindingsData(node);

    // 2. Analyze bindings
    const analysis = analyzeBindings(bindings, context);

    // 3. Validate bindings
    validateBindings(analysis, node);

    // 4. Handle repeater
    if (analysis.isRepeater) {
        return convertRepeaterNode(node, analysis, context);
    }

    // 5. Handle property variants
    if (analysis.type === 'property-variant') {
        return convertVariantNode(node, analysis, context);
    }

    // 6. Convert regular node
    return convertRegularNode(node, analysis, context);
}

/**
 * Finds the content FrameNode from a Jay Page section's children
 * @param section - The Jay Page section node
 * @returns The content FrameNode, or null with error/warning info
 */
function findContentFrame(section: FigmaVendorDocument): {
    frame: FigmaVendorDocument | null;
    error?: string;
    warning?: string;
} {
    if (!section.children || section.children.length === 0) {
        return {
            frame: null,
            error: `Jay Page section "${section.name}" has no children`,
        };
    }

    // Find all FrameNodes among the children
    const frameNodes = section.children.filter((child) => child.type === 'FRAME');

    if (frameNodes.length === 0) {
        return {
            frame: null,
            error: `Jay Page section "${section.name}" has no FrameNode children. Found: ${section.children.map((c) => c.type).join(', ')}`,
        };
    }

    if (frameNodes.length > 1) {
        return {
            frame: frameNodes[0],
            warning: `Jay Page section "${section.name}" has ${frameNodes.length} FrameNodes, using the first one`,
        };
    }

    // Exactly one frame found - ideal case
    return { frame: frameNodes[0] };
}

export const figmaVendor: Vendor<FigmaVendorDocument> = {
    vendorId: 'figma',

    async convertToBodyHtml(
        vendorDoc: FigmaVendorDocument,
        pageUrl: string,
        projectPage: ProjectPage,
        plugins: Plugin[],
    ): Promise<VendorConversionResult> {
        console.log(`🎨 Converting Figma document for page: ${pageUrl}`);
        console.log(`   Document type: ${vendorDoc.type}, name: ${vendorDoc.name}`);

        // Check if this is a Jay Page
        const isJPage = vendorDoc.pluginData?.['jpage'] === 'true';
        if (!isJPage) {
            throw new Error(
                `Document "${vendorDoc.name}" is not marked as a Jay Page (missing jpage='true' in pluginData)`,
            );
        }

        // Find the content FrameNode
        const { frame, error, warning } = findContentFrame(vendorDoc);

        if (error) {
            throw new Error(`Cannot convert to Jay HTML: ${error}`);
        }

        if (warning) {
            console.warn(`⚠️  ${warning}`);
        }

        if (!frame) {
            throw new Error(`Cannot convert to Jay HTML: No content frame found`);
        }

        console.log(`   Converting content frame: ${frame.name} (${frame.type})`);

        // Create empty set to collect font families during conversion
        const fontFamilies = new Set<string>();

        // Create conversion context
        const context: ConversionContext = {
            repeaterPathStack: [],
            indentLevel: 1, // Start at 1 for body content
            fontFamilies,
            projectPage,
            plugins,
        };

        // Convert the content frame to body HTML (fontFamilies will be populated during conversion)
        const bodyHtml = convertNodeToJayHtml(frame, context);

        if (fontFamilies.size > 0) {
            console.log(
                `   Found ${fontFamilies.size} font families: ${Array.from(fontFamilies).join(', ')}`,
            );
        }

        return {
            bodyHtml,
            fontFamilies,
            // No contract data for now - Figma vendor doesn't generate contracts yet
            contractData: undefined,
        };
    },
};
