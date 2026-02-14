import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import {
    getPositionStyle,
    getNodeSizeStyles,
    getCommonStyles,
    getBackgroundFillsStyle,
    getStrokeStyles,
} from '../utils';
import type { ParentContext } from '../types';

/**
 * Converts an ELLIPSE node to HTML with circular border radius
 */
export function convertEllipseToHtml(
    node: FigmaVendorDocument,
    indent: string,
    parent?: ParentContext,
): string {
    const { id } = node;

    // Get positioning and sizing
    const positionStyle = getPositionStyle(node, parent);
    const sizeStyles = getNodeSizeStyles(node, parent);
    const commonStyles = getCommonStyles(node);

    // Get ellipse-specific styles
    const backgroundStyle = getBackgroundFillsStyle(node);
    const strokeStyles = getStrokeStyles(node);

    // Ellipses always have border-radius: 50%
    const borderRadius = 'border-radius: 50%;';

    // Combine all styles with box-sizing
    const allStyles = `${positionStyle}${sizeStyles}${backgroundStyle}${strokeStyles}${borderRadius}${commonStyles}box-sizing: border-box;`;

    return `${indent}<div data-figma-id="${id}" style="${allStyles}"></div>\n`;
}
