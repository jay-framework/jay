import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import { getPositionStyle, getNodeSizeStyles, getCommonStyles, rgbToHex } from '../utils';

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
 * Converts a TEXT node to HTML with full styling
 */
export function convertTextNodeToHtml(node: FigmaVendorDocument, indent: string): string {
    const {
        name,
        id,
        characters,
        fontName,
        fontSize,
        fontWeight,
        fills,
        textAlignHorizontal,
        textAlignVertical,
        letterSpacing,
        lineHeight,
        textDecoration,
        textCase,
        textTruncation,
        maxLines,
        maxWidth,
        textAutoResize,
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

    // Vertical alignment wrapper
    let verticalAlignWrapperStyle = '';
    if (textAlignVertical) {
        verticalAlignWrapperStyle = 'display: flex; flex-direction: column;';
        switch (textAlignVertical) {
            case 'TOP':
                verticalAlignWrapperStyle += 'justify-content: flex-start;';
                break;
            case 'CENTER':
                verticalAlignWrapperStyle += 'justify-content: center;';
                break;
            case 'BOTTOM':
                verticalAlignWrapperStyle += 'justify-content: flex-end;';
                break;
        }
    }

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

    // Position, size, and common styles
    const positionStyle = getPositionStyle(node);
    const sizeStyles = getNodeSizeStyles(node);
    const commonStyles = getCommonStyles(node);

    // Combine all text styles
    const textStyles = `${fontFamilyStyle}${fontSizeStyle}${fontWeightStyle}${colorStyle}${textAlignStyle}${letterSpacingStyle}${lineHeightStyle}${textDecorationStyle}${textTransformStyle}${truncationStyle}`;

    // Process text content with hyperlinks
    let htmlContent = '';
    if (hyperlinks && hyperlinks.length > 0) {
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

    // Build HTML with proper indentation
    const childIndent = indent + '  ';
    const innerIndent = indent + '    ';

    const styleAttr = `${positionStyle}${sizeStyles}${commonStyles}${textStyles}`;

    if (verticalAlignWrapperStyle) {
        // With vertical alignment wrapper
        return (
            `${indent}<div data-figma-id="${id}" style="${styleAttr}${verticalAlignWrapperStyle}">\n` +
            `${childIndent}<div style="${textStyles}">\n` +
            `${innerIndent}${htmlContent}\n` +
            `${childIndent}</div>\n` +
            `${indent}</div>\n`
        );
    } else {
        // Simple text div
        return `${indent}<div data-figma-id="${id}" style="${styleAttr}">${htmlContent}</div>\n`;
    }
}
