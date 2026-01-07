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
import { convertTextNodeToHtml } from './converters/text';
import { convertRectangleToHtml } from './converters/rectangle';
import { convertEllipseToHtml } from './converters/ellipse';
import { convertVectorToHtml } from './converters/vector';

/**
 * Figma Vendor Implementation
 *
 * This converts Figma FigmaVendorDocument documents to Jay HTML body content.
 *
 * The FigmaVendorDocument type is imported from @jay-framework/editor-protocol,
 * which is the single source of truth for the vendor document structure.
 */

/**

/**

/**

/**

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
    } else if (type === 'RECTANGLE') {
        // Convert rectangles to divs with background, border radius, and strokes
        html += convertRectangleToHtml(node, indent);
    } else if (type === 'ELLIPSE') {
        // Convert ellipses to divs with circular border radius
        html += convertEllipseToHtml(node, indent);
    } else if (type === 'VECTOR' || type === 'STAR' || type === 'POLYGON' || type === 'LINE' || type === 'BOOLEAN_OPERATION') {
        // Convert vectors and vector-based shapes to divs with embedded SVG
        html += convertVectorToHtml(node, indent);
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
