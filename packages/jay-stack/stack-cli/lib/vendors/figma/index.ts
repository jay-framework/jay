import { Vendor } from '../types';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

/**
 * Figma Vendor Implementation
 *
 * This converts Figma FigmaVendorDocument documents to Jay HTML.
 *
 * The FigmaVendorDocument type is imported from @jay-framework/editor-protocol,
 * which is the single source of truth for the vendor document structure.
 */

/**
 * Basic converter for Figma nodes to Jay HTML
 * This is a simple implementation for initial end-to-end testing
 */
function convertNodeToJayHtml(node: FigmaVendorDocument, indent: string = ''): string {
    const { name, type, children, pluginData, width, height } = node;

    // Extract Jay-specific data from pluginData
    const isJPage = pluginData?.['jpage'] === 'true';
    const urlRoute = pluginData?.['urlRoute'];
    const semanticHtml = pluginData?.['semanticHtml'];
    const bindingsData = pluginData?.['jay-layer-bindings'];

    // For now, we'll create simple HTML structure
    let html = '';

    if (type === 'SECTION' && isJPage) {
        // This is a Jay Page - the root container
        html += `${indent}<section data-figma-id="${node.id}" data-page-url="${urlRoute || ''}">\n`;
        html += `${indent}  <!-- Jay Page: ${name} -->\n`;

        if (children && children.length > 0) {
            children.forEach((child) => {
                html += convertNodeToJayHtml(child, indent + '  ');
            });
        }

        html += `${indent}</section>\n`;
    } else if (type === 'FRAME') {
        // Convert frames to divs
        const tag = semanticHtml || 'div';
        html += `${indent}<${tag} data-figma-id="${node.id}" data-figma-type="frame">\n`;
        html += `${indent}  <!-- ${name} -->\n`;

        if (children && children.length > 0) {
            children.forEach((child) => {
                html += convertNodeToJayHtml(child, indent + '  ');
            });
        }

        html += `${indent}</${tag}>\n`;
    } else if (type === 'TEXT') {
        // Convert text nodes
        const tag = semanticHtml || 'p';
        html += `${indent}<${tag}">${name}</${tag}>\n`;
    } else if (type === 'RECTANGLE' || type === 'ELLIPSE' || type === 'VECTOR') {
        // Convert shapes to placeholder divs
        const tag = semanticHtml || 'div';
        html += `${indent}<${tag}><!-- ${name} --></${tag}>\n`;
    } else if (children && children.length > 0) {
        // Generic container with children
        const tag = semanticHtml || 'div';
        html += `${indent}<${tag}>\n`;
        html += `${indent}  <!-- ${name} -->\n`;

        children.forEach((child) => {
            html += convertNodeToJayHtml(child, indent + '  ');
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

    async convertToJayHtml(vendorDoc: FigmaVendorDocument, pageUrl: string): Promise<string> {
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

        // Convert the content frame to Jay HTML
        const jayHtml = convertNodeToJayHtml(frame);

        return jayHtml.trim();
    },
};
