import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import { getCommonStyles, rgbToHex } from '../utils';

/**
 * Escapes HTML special characters
 */
function escapeHtmlContent(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Converts a TEXT node to HTML with full styling and data binding support
 * @param node - The serialized TEXT node
 * @param indent - Indentation string
 * @param dynamicContent - Optional dynamic content binding (e.g., "{user.name}")
 * @param refAttr - Optional ref attribute (e.g., ' ref="email"')
 * @param attributesHtml - Optional HTML attributes (e.g., ' value="{email}"')
 */
export function convertTextNodeToHtml(
    node: FigmaVendorDocument,
    indent: string,
    dynamicContent?: string,
    refAttr?: string,
    attributesHtml?: string,
    parentCssClassName?: string,
    ifCondition?: string,
): string {
    const semanticTag = node.pluginData?.['semanticHtml'];
    const rawClassName = node.pluginData?.['className'];
    const cssClassName = rawClassName
        ? rawClassName
              .replace(/\{[^}]*\}/g, '')
              .trim()
              .replace(/\s+/g, ' ') || undefined
        : undefined;
    const tag = semanticTag || 'div';

    const {
        name,
        id,
        characters,
        fontName,
        fontSize,
        fontWeight,
        fills,
        textAlignHorizontal,
        letterSpacing,
        lineHeight,
        textDecoration,
        textCase,
        textTruncation,
        maxLines,
        maxWidth,
        hasMissingFont,
        hyperlinks,
    } = node;

    // Handle missing fonts
    if (hasMissingFont || !characters) {
        if (hasMissingFont) {
            return `${indent}<!-- Text node "${name}" has missing fonts -->\n`;
        }
        return '';
    }

    // Font family
    let fontFamilyStyle = 'font-family: sans-serif;';
    if (fontName && typeof fontName === 'object' && fontName.family) {
        fontFamilyStyle = `font-family: '${fontName.family}', sans-serif;`;
    }

    // Font size
    const fontSizeValue = typeof fontSize === 'number' ? fontSize : 16;
    const fontSizeStyle = `font-size: ${fontSizeValue}px;`;

    // Font weight
    const fontWeightValue = typeof fontWeight === 'number' ? fontWeight : 400;
    const fontWeightStyle = `font-weight: ${fontWeightValue};`;

    // Text color
    let textColor = '#000000';
    if (
        fills &&
        Array.isArray(fills) &&
        fills.length > 0 &&
        fills[0].type === 'SOLID' &&
        fills[0].color
    ) {
        textColor = rgbToHex(fills[0].color);
    }
    const colorStyle = `color: ${textColor};`;

    // Text alignment
    const textAlign = textAlignHorizontal ? textAlignHorizontal.toLowerCase() : 'left';
    const textAlignStyle = `text-align: ${textAlign};`;

    // Letter spacing
    let letterSpacingStyle = '';
    if (letterSpacing && letterSpacing.value !== 0) {
        const unit = letterSpacing.unit === 'PIXELS' ? 'px' : '%';
        letterSpacingStyle = `letter-spacing: ${letterSpacing.value}${unit};`;
    }

    // Line height
    let lineHeightStyle = '';
    if (lineHeight) {
        if (lineHeight.unit === 'AUTO') {
            lineHeightStyle = 'line-height: normal;';
        } else {
            const unit = lineHeight.unit === 'PIXELS' ? 'px' : '%';
            lineHeightStyle = `line-height: ${lineHeight.value}${unit};`;
        }
    }

    // Text decoration
    let textDecorationStyle = '';
    if (textDecoration === 'UNDERLINE') {
        textDecorationStyle = 'text-decoration: underline;';
    } else if (textDecoration === 'STRIKETHROUGH') {
        textDecorationStyle = 'text-decoration: line-through;';
    }

    // Text case transformation
    let textTransformStyle = '';
    if (textCase && textCase !== 'ORIGINAL') {
        switch (textCase) {
            case 'UPPER':
                textTransformStyle = 'text-transform: uppercase;';
                break;
            case 'LOWER':
                textTransformStyle = 'text-transform: lowercase;';
                break;
            case 'TITLE':
                textTransformStyle = 'text-transform: capitalize;';
                break;
        }
    }

    // Text truncation
    let truncationStyle = '';
    if (textTruncation === 'ENDING') {
        if (maxLines && maxLines > 1) {
            // Multi-line truncation
            truncationStyle = `display: -webkit-box; -webkit-line-clamp: ${maxLines}; -webkit-box-orient: vertical; overflow: hidden;`;
        } else {
            // Single-line truncation
            truncationStyle = 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        }
    }
    if (maxWidth && maxWidth > 0) {
        truncationStyle += `max-width: ${maxWidth}px;`;
    }

    const commonStyles = getCommonStyles(node);

    // Combine all text styles
    const textStyles = `${fontFamilyStyle}${fontSizeStyle}${fontWeightStyle}${colorStyle}${textAlignStyle}${letterSpacingStyle}${lineHeightStyle}${textDecorationStyle}${textTransformStyle}${truncationStyle}`;

    // Process text content - use binding if available, otherwise use static text
    let htmlContent = '';
    if (dynamicContent) {
        // Text is bound to data - use the binding expression
        htmlContent = dynamicContent;
    } else if (hyperlinks && hyperlinks.length > 0) {
        let lastEnd = 0;
        for (const link of hyperlinks) {
            // Add text before link
            if (link.start > lastEnd) {
                const beforeText = characters.substring(lastEnd, link.start);
                htmlContent += escapeHtmlContent(beforeText).replace(/\n/g, '<br>');
            }
            // Add link
            const linkText = characters.substring(link.start, link.end + 1);
            htmlContent += `<a href="${escapeHtmlContent(link.url)}" style="color: inherit;">${escapeHtmlContent(linkText).replace(/\n/g, '<br>')}</a>`;
            lastEnd = link.end + 1;
        }
        // Add remaining text after last link
        if (lastEnd < characters.length) {
            const afterText = characters.substring(lastEnd);
            htmlContent += escapeHtmlContent(afterText).replace(/\n/g, '<br>');
        }
    } else {
        // No hyperlinks, just escape and convert newlines
        htmlContent = escapeHtmlContent(characters).replace(/\n/g, '<br>');
    }

    const refString = refAttr || '';
    const attrsString = attributesHtml || '';
    const classAttr = cssClassName ? ` class="${cssClassName}"` : '';
    const ifAttr = ifCondition ? ` if="${ifCondition}"` : '';

    let effectiveStyle: string;
    if (cssClassName) {
        effectiveStyle = '';
    } else if (parentCssClassName) {
        // TEXT inside a class-bearing parent: suppress CSS-inheritable properties
        // (color, font-weight, font-family, font-size, etc.) since the parent's class
        // defines them. Only emit non-inheritable overrides like truncation and layout.
        effectiveStyle = `${truncationStyle}`;
    } else {
        effectiveStyle = `${commonStyles}${textStyles}`;
    }
    const styleStr = effectiveStyle ? ` style="${effectiveStyle}"` : '';

    return `${indent}<${tag}${classAttr}${ifAttr}${refString}${attrsString}${styleStr}>${htmlContent}</${tag}>\n`;
}
