import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
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
 * Converts a repeater node to Jay HTML with forEach
 *
 * A repeater must be a FrameNode with auto-layout. The structure is:
 * 1. Outer container div - has Frame's position, size, layout, background styles
 * 2. Inner forEach div - minimal positioning, this is what wraps the repeated template
 * 3. Template child - the first child, which gets repeated
 */
export function convertRepeaterNode(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
    convertNodeToJayHtml: (node: FigmaVendorDocument, context: ConversionContext) => string,
): string {
    const { repeaterPath, trackByKey } = analysis;
    const indent = '  '.repeat(context.indentLevel);
    const innerIndent = '  '.repeat(context.indentLevel + 1);

    // Validate that this is a Frame with auto-layout
    if (node.type !== 'FRAME') {
        throw new Error(`Repeater node "${node.name}" must be a FRAME (got: ${node.type})`);
    }

    if (!node.layoutMode || node.layoutMode === 'NONE') {
        throw new Error(
            `Repeater node "${node.name}" must have auto-layout (HORIZONTAL or VERTICAL)`,
        );
    }

    // Build styles for the outer container
    // This div has all the Frame's styling and is positioned once
    const positionStyle = getPositionStyle(node);
    let frameSizeStyles = getFrameSizeStyles(node);

    // Repeater containers should fill available cross-axis space.
    // In Figma, HUG sizing is based on a single template item with placeholder text,
    // but at runtime the repeater has real content that should fill the parent.
    if (node.layoutMode === 'VERTICAL' && node.layoutSizingHorizontal === 'HUG') {
        frameSizeStyles = frameSizeStyles.replace('width: fit-content;', 'width: 100%;');
    }
    if (node.layoutMode === 'HORIZONTAL' && node.layoutSizingVertical === 'HUG') {
        frameSizeStyles = frameSizeStyles.replace('height: fit-content;', 'height: 100%;');
    }

    const backgroundStyle = getBackgroundFillsStyle(node);
    const borderRadius = getBorderRadius(node);
    const strokeStyles = getStrokeStyles(node);
    const flexStyles = getAutoLayoutStyles(node);
    const overflowStyles = getOverflowStyles(node);
    const commonStyles = getCommonStyles(node);

    const outerStyleAttr = `${positionStyle}${frameSizeStyles}${backgroundStyle}${strokeStyles}${borderRadius}${overflowStyles}${commonStyles}${flexStyles}box-sizing: border-box;`;

    // Determine inner forEach div sizing based on layout direction
    // The forEach div should fill the appropriate dimension to allow items to layout properly
    let innerDivSizeStyles = '';
    if (node.layoutWrap === 'WRAP') {
        innerDivSizeStyles = 'width: fit-content; height: fit-content;';
    } else if (node.layoutMode === 'HORIZONTAL') {
        // For horizontal layout, forEach div should fill height
        innerDivSizeStyles = 'height: 100%;';
    } else if (node.layoutMode === 'VERTICAL') {
        // For vertical layout, forEach div should fill width
        innerDivSizeStyles = 'width: 100%;';
    }

    // Create outer container with Frame styling
    let html = `${indent}<div id="${node.id}" data-figma-id="${node.id}" data-figma-type="frame-repeater" style="${outerStyleAttr}">\n`;

    // Create inner forEach div with minimal positioning
    html += `${innerIndent}<div style="position: relative; ${innerDivSizeStyles}" forEach="${repeaterPath}" trackBy="${trackByKey}">\n`;

    // Push repeater path to context stack
    const newContext: ConversionContext = {
        ...context,
        repeaterPathStack: [...context.repeaterPathStack, repeaterPath!.split('.')],
        indentLevel: context.indentLevel + 2, // +2 because we're inside both divs
    };

    // Convert only the first child - it's the template that gets repeated.
    // Override the template child's cross-axis HUG to FILL so items stretch
    // to fill the repeater container (enabling layouts like space-between).
    if (node.children && node.children.length > 0) {
        let templateChild = node.children[0];

        if (templateChild.type === 'FRAME') {
            const overrides: Partial<typeof templateChild> = {};
            if (node.layoutMode === 'VERTICAL' && templateChild.layoutSizingHorizontal === 'HUG') {
                overrides.layoutSizingHorizontal = 'FILL';
            }
            if (
                node.layoutMode === 'HORIZONTAL' &&
                templateChild.layoutSizingVertical === 'HUG'
            ) {
                overrides.layoutSizingVertical = 'FILL';
            }
            if (Object.keys(overrides).length > 0) {
                templateChild = { ...templateChild, ...overrides };
            }
        }

        html += convertNodeToJayHtml(templateChild, newContext);
    } else {
        throw new Error(
            `Repeater node "${node.name}" has no children - repeater template is required`,
        );
    }

    // Close inner forEach div
    html += `${innerIndent}</div>\n`;

    // Close outer container div
    html += `${indent}</div>\n`;

    return html;
}
