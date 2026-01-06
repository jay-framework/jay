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

export const figmaVendor: Vendor<FigmaVendorDocument> = {
    vendorId: 'figma',

    async convertToJayHtml(vendorDoc: FigmaVendorDocument, pageUrl: string): Promise<string> {
        console.log(`🎨 Converting Figma document for page: ${pageUrl}`);
        console.log(`   Document type: ${vendorDoc.type}, name: ${vendorDoc.name}`);

        // Check if this is a Jay Page
        const isJPage = vendorDoc.pluginData?.['jpage'] === 'true';
        if (!isJPage) {
            console.warn(`⚠️  Document is not marked as a Jay Page`);
        }

        // Convert the node tree to Jay HTML
        const jayHtml = convertNodeToJayHtml(vendorDoc);

        return jayHtml.trim();
    },
};
