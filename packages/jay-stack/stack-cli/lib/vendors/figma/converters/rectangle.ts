import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import {
    getPositionStyle,
    getNodeSizeStyles,
    getCommonStyles,
    getBackgroundFillsStyle,
    getStrokeStyles,
    getBorderRadius,
} from '../utils';
import type { ParentContext } from '../types';

/**
 * Converts a RECTANGLE node to HTML with background fills, border radius, and strokes
 */
export function convertRectangleToHtml(node: FigmaVendorDocument, indent: string, parent?: ParentContext): string {
    const { id } = node;

    // Get positioning and sizing
    const positionStyle = getPositionStyle(node, parent);
    const sizeStyles = getNodeSizeStyles(node, parent);
    const commonStyles = getCommonStyles(node);

    // Get rectangle-specific styles
    const backgroundStyle = getBackgroundFillsStyle(node);
    const borderRadius = getBorderRadius(node);
    const strokeStyles = getStrokeStyles(node);

    // Combine all styles with box-sizing
    const allStyles = `${positionStyle}${sizeStyles}${backgroundStyle}${strokeStyles}${borderRadius}${commonStyles}box-sizing: border-box;`;

    return `${indent}<div data-figma-id="${id}" style="${allStyles}"></div>\n`;
}
