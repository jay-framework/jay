import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import type { ConversionContext, BindingAnalysis } from '../types';
import { getPositionStyle, getNodeSizeStyles, getCommonStyles } from '../utils';

/**
 * Converts a GROUP node to Jay HTML
 *
 * Groups in Figma are layout containers that:
 * - Have no visual styling (no background, borders, padding)
 * - Use absolute positioning for their children
 * - Act as a bounding box for their contained elements
 * - Size is determined by the union of all children's bounds
 *
 * Structure:
 * - Outer div: has group's position, size, and common styles (opacity, rotation, effects)
 * - Children: positioned absolutely within the group
 */
export function convertGroupNode(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
    convertNodeToJayHtml: (node: FigmaVendorDocument, context: ConversionContext) => string,
): string {
    const indent = '  '.repeat(context.indentLevel);

    // Groups have position, size, and common styles but no visual styling
    const positionStyle = getPositionStyle(node);
    const sizeStyles = getNodeSizeStyles(node);
    const commonStyles = getCommonStyles(node);

    const styleAttr = `${positionStyle}${sizeStyles}${commonStyles}box-sizing: border-box;`;

    // Determine ref attribute from analysis
    let refAttr = '';
    if (analysis.refPath) {
        refAttr = ` ref="${analysis.refPath}"`;
    } else if (analysis.dualPath) {
        refAttr = ` ref="${analysis.dualPath}"`;
    }

    // Build HTML attributes
    let htmlAttrs = `id="${node.id}" data-figma-id="${node.id}" data-figma-type="group"${refAttr} style="${styleAttr}"`;

    // Add other attributes (like data bindings)
    for (const [attr, tagPath] of analysis.attributes) {
        htmlAttrs += ` ${attr}="{${tagPath}}"`;
    }

    // Build group container
    let html = `${indent}<div ${htmlAttrs}>\n`;

    const childContext: ConversionContext = {
        ...context,
        indentLevel: context.indentLevel + 1,
    };

    // Convert children
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            html += convertNodeToJayHtml(child, childContext);
        }
    }

    html += `${indent}</div>\n`;

    return html;
}
