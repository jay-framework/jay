import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import { getPositionStyle, getNodeSizeStyles, getCommonStyles } from '../utils';
import type { ParentContext } from '../types';

/**
 * Converts a VECTOR node to HTML with embedded SVG
 */
export function convertVectorToHtml(
    node: FigmaVendorDocument,
    indent: string,
    parent?: ParentContext,
): string {
    const { id, name, svgContent, svgExportFailed, width, height } = node;

    // Get positioning and sizing
    const positionStyle = getPositionStyle(node, parent);
    const sizeStyles = getNodeSizeStyles(node, parent);
    const commonStyles = getCommonStyles(node);

    let finalSvgContent: string;

    if (svgExportFailed || !svgContent) {
        // Fallback placeholder SVG if export failed
        finalSvgContent =
            `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
            `<rect width="${width}" height="${height}" fill="none" stroke="#ccc" stroke-width="1" stroke-dasharray="5,5"/>` +
            `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#999">Vector: ${name}</text>` +
            `</svg>`;
    } else {
        finalSvgContent = svgContent;
    }

    // Combine all styles with box-sizing
    const allStyles = `${positionStyle}${sizeStyles}${commonStyles}box-sizing: border-box;`;

    const childIndent = indent + '  ';

    return (
        `${indent}<div data-figma-id="${id}" data-figma-type="vector" style="${allStyles}">\n` +
        `${childIndent}${finalSvgContent}\n` +
        `${indent}</div>\n`
    );
}
