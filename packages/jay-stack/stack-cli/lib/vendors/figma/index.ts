import { Vendor, VendorConversionResult } from '../types';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
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
    rgbToHex
} from './utils';

/**
 * Figma Vendor Implementation
 *
 * This converts Figma FigmaVendorDocument documents to Jay HTML body content.
 *
 * The FigmaVendorDocument type is imported from @jay-framework/editor-protocol,
 * which is the single source of truth for the vendor document structure.
 */

/**
 * Escapes HTML special characters
 */
function escapeHtmlContent(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Converts a TEXT node to HTML with full styling
 */
function convertTextNodeToHtml(node: FigmaVendorDocument, indent: string): string {
    const { name, id, characters, fontName, fontSize, fontWeight, fills, 
            textAlignHorizontal, textAlignVertical, letterSpacing, lineHeight,
            textDecoration, textCase, textTruncation, maxLines, maxWidth,
            textAutoResize, hasMissingFont, hyperlinks, width, height } = node;
    
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
    if (fills && Array.isArray(fills) && fills.length > 0 && fills[0].type === 'SOLID' && fills[0].color) {
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
    
    // Size styles - use utility function instead of hardcoded dimensions
    let sizeStyles = getNodeSizeStyles(node);
    if (textAutoResize === 'HEIGHT') {
        // Override height for auto-resize text
        sizeStyles = sizeStyles.replace(/height: \d+px;/, 'height: auto;');
    }
    
    // Position style - use utility function
    const positionStyle = getPositionStyle(node);
    
    // Common styles (opacity, rotation, effects)
    const commonStyles = getCommonStyles(node);
    
    // Process text content with hyperlinks
    let htmlContent = '';
    if (hyperlinks && hyperlinks.length > 0) {
        let lastEnd = -1;
        for (const link of hyperlinks) {
            // Add text before link
            if (link.start > lastEnd + 1) {
                const beforeText = characters.substring(lastEnd + 1, link.start);
                htmlContent += escapeHtmlContent(beforeText).replace(/\n/g, '<br>');
            }
            // Add link
            const linkText = characters.substring(link.start, link.end + 1);
            htmlContent += `<a href="${link.url}" style="color: inherit;">${escapeHtmlContent(linkText).replace(/\n/g, '<br>')}</a>`;
            lastEnd = link.end;
        }
        // Add remaining text after last link
        if (lastEnd + 1 < characters.length) {
            const afterText = characters.substring(lastEnd + 1);
            htmlContent += escapeHtmlContent(afterText).replace(/\n/g, '<br>');
        }
    } else {
        // No hyperlinks, just escape and convert newlines
        htmlContent = escapeHtmlContent(characters).replace(/\n/g, '<br>');
    }
    
    // Combine all text styles
    const textStyles = `${fontFamilyStyle}${fontSizeStyle}${fontWeightStyle}${colorStyle}${textAlignStyle}${letterSpacingStyle}${lineHeightStyle}${textDecorationStyle}${textTransformStyle}${truncationStyle}`;
    
    // Build HTML with proper indentation
    const childIndent = indent + '  ';
    const innerIndent = indent + '    ';
    
    if (verticalAlignWrapperStyle) {
        // With vertical alignment wrapper
        return `${indent}<div data-figma-id="${id}" style="${positionStyle}${sizeStyles}${commonStyles}${verticalAlignWrapperStyle}">\n` +
               `${childIndent}<div style="${textStyles}">\n` +
               `${innerIndent}${htmlContent}\n` +
               `${childIndent}</div>\n` +
               `${indent}</div>\n`;
    } else {
        // Simple text div
        return `${indent}<div data-figma-id="${id}" style="${positionStyle}${sizeStyles}${commonStyles}${textStyles}">\n` +
               `${childIndent}${htmlContent}\n` +
               `${indent}</div>\n`;
    }
}

/**
 * Basic converter for Figma nodes to Jay HTML
 * This is a simple implementation for initial end-to-end testing
 * @param node - The Figma node to convert
 * @param fontFamilies - Set to collect font families encountered during conversion
 * @param indent - Current indentation level
 */
function convertNodeToJayHtml(node: FigmaVendorDocument, fontFamilies: Set<string>, indent: string = ''): string {
    const { name, type, children, pluginData, width, height } = node;

    // Extract Jay-specific data from pluginData
    const isJPage = pluginData?.['jpage'] === 'true';
    const urlRoute = pluginData?.['urlRoute'];
    const semanticHtml = pluginData?.['semanticHtml'];
    const bindingsData = pluginData?.['jay-layer-bindings'];

    // Collect font family if this is a TEXT node
    if (type === 'TEXT' && node.fontName) {
        if (typeof node.fontName === 'object' && node.fontName.family) {
            // Single font for the entire text
            fontFamilies.add(node.fontName.family);
        }
        // Note: For MIXED fonts, we would need to access the original Figma node
        // to call getRangeFontName() for each character. This is not available in the
        // serialized document. For now, we'll only collect single fonts.
        // Mixed fonts can be handled in a future enhancement.
    }

    // Get position, size, and common styles for most nodes
    const positionStyle = getPositionStyle(node);
    const sizeStyles = getNodeSizeStyles(node);
    const commonStyles = getCommonStyles(node);
    const styleAttr = `style="${positionStyle}${sizeStyles}${commonStyles}"`;

    // For now, we'll create simple HTML structure
    let html = '';

    if (type === 'SECTION' && isJPage) {
        // This is a Jay Page - the root container
        html += `${indent}<section data-figma-id="${node.id}" data-page-url="${urlRoute || ''}">\n`;
        html += `${indent}  <!-- Jay Page: ${name} -->\n`;

        if (children && children.length > 0) {
            children.forEach((child) => {
                html += convertNodeToJayHtml(child, fontFamilies, indent + '  ');
            });
        }

        html += `${indent}</section>\n`;
    } else if (type === 'FRAME') {
        // Convert frames to divs with full styling (layout, background, borders, etc.)
        const tag = semanticHtml || 'div';
        
        // Build Frame-specific styles
        const backgroundStyle = getBackgroundFillsStyle(node);
        const borderRadius = getBorderRadius(node);
        const strokeStyles = getStrokeStyles(node);
        const flexStyles = getAutoLayoutStyles(node);
        const overflowStyles = getOverflowStyles(node);
        
        // For frames, use getFrameSizeStyles instead of getNodeSizeStyles
        const sizeStyles = getFrameSizeStyles(node);
        
        // Combine all styles
        const allStyles = `${positionStyle}${sizeStyles}${backgroundStyle}${strokeStyles}${borderRadius}${overflowStyles}${commonStyles}${flexStyles}box-sizing: border-box;`;
        
        html += `${indent}<${tag} data-figma-id="${node.id}" data-figma-type="frame" style="${allStyles}">\n`;
        html += `${indent}  <!-- ${name} -->\n`;

        if (children && children.length > 0) {
            children.forEach((child) => {
                html += convertNodeToJayHtml(child, fontFamilies, indent + '  ');
            });
        }

        html += `${indent}</${tag}>\n`;
    } else if (type === 'TEXT') {
        // Convert text nodes with full styling
        html += convertTextNodeToHtml(node, indent);
    } else if (type === 'RECTANGLE' || type === 'ELLIPSE' || type === 'VECTOR') {
        // Convert shapes to placeholder divs with positioning
        const tag = semanticHtml || 'div';
        html += `${indent}<${tag} data-figma-id="${node.id}" data-figma-type="${type.toLowerCase()}" ${styleAttr}><!-- ${name} --></${tag}>\n`;
    } else if (children && children.length > 0) {
        // Generic container with children
        const tag = semanticHtml || 'div';
        html += `${indent}<${tag} data-figma-id="${node.id}" data-figma-type="${type.toLowerCase()}" ${styleAttr}>\n`;
        html += `${indent}  <!-- ${name} -->\n`;

        children.forEach((child) => {
            html += convertNodeToJayHtml(child, fontFamilies, indent + '  ');
        });

        html += `${indent}</${tag}>\n`;
    } else {
        // Leaf node
        html += `${indent}<!-- ${name} (${type}) -->\n`;
    }

    return html;
}

/**
 * Finds the content FrameNode from a Jay Page section's children
 * @param section - The Jay Page section node
 * @returns The content FrameNode, or null with error/warning info
 */
function findContentFrame(section: FigmaVendorDocument): { 
    frame: FigmaVendorDocument | null; 
    error?: string; 
    warning?: string 
} {
    if (!section.children || section.children.length === 0) {
        return { 
            frame: null, 
            error: `Jay Page section "${section.name}" has no children` 
        };
    }

    // Find all FrameNodes among the children
    const frameNodes = section.children.filter(child => child.type === 'FRAME');

    if (frameNodes.length === 0) {
        return { 
            frame: null, 
            error: `Jay Page section "${section.name}" has no FrameNode children. Found: ${section.children.map(c => c.type).join(', ')}` 
        };
    }

    if (frameNodes.length > 1) {
        return { 
            frame: frameNodes[0], 
            warning: `Jay Page section "${section.name}" has ${frameNodes.length} FrameNodes, using the first one` 
        };
    }

    // Exactly one frame found - ideal case
    return { frame: frameNodes[0] };
}

export const figmaVendor: Vendor<FigmaVendorDocument> = {
    vendorId: 'figma',

    async convertToBodyHtml(vendorDoc: FigmaVendorDocument, pageUrl: string): Promise<VendorConversionResult> {
        console.log(`🎨 Converting Figma document for page: ${pageUrl}`);
        console.log(`   Document type: ${vendorDoc.type}, name: ${vendorDoc.name}`);

        // Check if this is a Jay Page
        const isJPage = vendorDoc.pluginData?.['jpage'] === 'true';
        if (!isJPage) {
            throw new Error(`Document "${vendorDoc.name}" is not marked as a Jay Page (missing jpage='true' in pluginData)`);
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

        // Convert the content frame to body HTML (fontFamilies will be populated during conversion)
        const bodyHtml = convertNodeToJayHtml(frame, fontFamilies, '  ');
        
        if (fontFamilies.size > 0) {
            console.log(`   Found ${fontFamilies.size} font families: ${Array.from(fontFamilies).join(', ')}`);
        }

        return {
            bodyHtml,
            fontFamilies,
            // No contract data for now - Figma vendor doesn't generate contracts yet
            contractData: undefined,
        };
    },
};

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
}
