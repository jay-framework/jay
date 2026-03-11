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

const SEMANTIC_TAGS = new Set([
    'header',
    'footer',
    'nav',
    'main',
    'section',
    'article',
    'aside',
    'a',
    'button',
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    'figure',
    'figcaption',
    'details',
    'summary',
]);

function sanitizeClassName(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return (
        raw
            .replace(/\{[^}]*\}/g, '')
            .trim()
            .replace(/\s+/g, ' ') || undefined
    );
}

/**
 * Converts a repeater node to Jay HTML with forEach.
 *
 * When the repeater has CSS classes from the original jay-html, we emit a
 * single element with both `class` and `forEach` to preserve the DOM structure
 * (important for CSS grid/flex on parent containers whose selectors target
 * direct children).
 *
 * When there are no CSS classes, we use the two-level structure:
 *   outer container (styling) > inner forEach div > template child
 */
export function convertRepeaterNode(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
    convertNodeToJayHtml: (node: FigmaVendorDocument, context: ConversionContext) => string,
): string {
    const { repeaterPath, trackByKey } = analysis;
    const indent = '  '.repeat(context.indentLevel);

    if (node.type !== 'FRAME') {
        throw new Error(`Repeater node "${node.name}" must be a FRAME (got: ${node.type})`);
    }

    if (!node.layoutMode || node.layoutMode === 'NONE') {
        node = { ...node, layoutMode: 'VERTICAL' };
    }

    const cssClassName = sanitizeClassName(node.pluginData?.['className']);
    const semanticHtml = node.pluginData?.['semanticHtml'];
    const tag = semanticHtml && SEMANTIC_TAGS.has(semanticHtml) ? semanticHtml : 'div';

    if (cssClassName) {
        return convertRepeaterFlat(
            node,
            analysis,
            context,
            convertNodeToJayHtml,
            tag,
            cssClassName,
        );
    }
    return convertRepeaterWrapped(node, analysis, context, convertNodeToJayHtml);
}

/**
 * Flat structure: single element with class + forEach.
 * Preserves CSS parent-child relationships (e.g. CSS grid direct children).
 */
function convertRepeaterFlat(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
    convertNodeToJayHtml: (node: FigmaVendorDocument, context: ConversionContext) => string,
    tag: string,
    cssClassName: string,
): string {
    const { repeaterPath, trackByKey } = analysis;
    const indent = '  '.repeat(context.indentLevel);

    let html = `${indent}<${tag} class="${cssClassName}" forEach="${repeaterPath}" trackBy="${trackByKey}">\n`;

    const newContext: ConversionContext = {
        ...context,
        repeaterPathStack: [...context.repeaterPathStack, repeaterPath!.split('.')],
        indentLevel: context.indentLevel + 1,
    };

    if (!node.children || node.children.length === 0) {
        throw new Error(
            `Repeater node "${node.name}" has no children — repeater template is required`,
        );
    }

    // In the flat repeater structure, the node IS the forEach element.
    // All its children are template content (not demo copies — those live
    // as siblings at the parent level).
    for (const child of node.children) {
        const effective = child.type === 'FRAME' ? applyStretchOverrides(node, child) : child;
        html += convertNodeToJayHtml(effective, newContext);
    }

    html += `${indent}</${tag}>\n`;
    return html;
}

/**
 * Wrapped structure (original behavior): outer container + inner forEach div.
 * Used when there are no CSS classes to preserve.
 */
function convertRepeaterWrapped(
    node: FigmaVendorDocument,
    analysis: BindingAnalysis,
    context: ConversionContext,
    convertNodeToJayHtml: (node: FigmaVendorDocument, context: ConversionContext) => string,
): string {
    const { repeaterPath, trackByKey } = analysis;
    const indent = '  '.repeat(context.indentLevel);
    const innerIndent = '  '.repeat(context.indentLevel + 1);

    const positionStyle = getPositionStyle(node);
    let frameSizeStyles = getFrameSizeStyles(node);

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

    let innerDivSizeStyles = '';
    if (node.layoutWrap === 'WRAP') {
        innerDivSizeStyles = 'width: fit-content; height: fit-content;';
    } else if (node.layoutMode === 'HORIZONTAL') {
        innerDivSizeStyles = 'height: 100%;';
    } else if (node.layoutMode === 'VERTICAL') {
        innerDivSizeStyles = 'width: 100%;';
    }

    let html = `${indent}<div id="${node.id}" style="${outerStyleAttr}">\n`;
    html += `${innerIndent}<div style="position: relative; ${innerDivSizeStyles}" forEach="${repeaterPath}" trackBy="${trackByKey}">\n`;

    const newContext: ConversionContext = {
        ...context,
        repeaterPathStack: [...context.repeaterPathStack, repeaterPath!.split('.')],
        indentLevel: context.indentLevel + 2,
    };

    if (!node.children || node.children.length === 0) {
        throw new Error(
            `Repeater node "${node.name}" has no children — repeater template is required`,
        );
    }

    let templateChild = node.children[0];
    if (templateChild.type === 'FRAME') {
        templateChild = applyStretchOverrides(node, templateChild);
    }
    html += convertNodeToJayHtml(templateChild, newContext);

    html += `${innerIndent}</div>\n`;
    html += `${indent}</div>\n`;
    return html;
}

function applyStretchOverrides(
    parent: FigmaVendorDocument,
    child: FigmaVendorDocument,
): FigmaVendorDocument {
    const overrides: Partial<typeof child> = {};
    if (parent.layoutMode === 'VERTICAL' && child.layoutSizingHorizontal === 'HUG') {
        overrides.layoutSizingHorizontal = 'FILL';
    }
    if (parent.layoutMode === 'HORIZONTAL' && child.layoutSizingVertical === 'HUG') {
        overrides.layoutSizingVertical = 'FILL';
    }
    return Object.keys(overrides).length > 0 ? { ...child, ...overrides } : child;
}
