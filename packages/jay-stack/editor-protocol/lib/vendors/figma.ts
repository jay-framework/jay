/**
 * Figma Vendor Document Type
 *
 * A JSON-compatible representation of Figma nodes that can be safely
 * transmitted over the protocol.
 *
 * @example
 * ```typescript
 * import { FigmaVendorDocument } from '@jay-framework/editor-protocol';
 *
 * const sectionNode = figma.currentPage.selection[0];
 * const vendorDoc: FigmaVendorDocument = serializeNode(sectionNode);
 *
 * await editorProtocol.export({
 *   vendorId: 'figma',
 *   pageUrl: '/home',
 *   vendorDoc
 * });
 * ```
 */
export type FigmaVendorDocument = {
    id: string;
    name: string;
    type: string;
    visible?: boolean;
    locked?: boolean;
    parentId?: string;
    children?: FigmaVendorDocument[];

    // Layout
    x?: number;
    y?: number;
    width?: number;
    height?: number;

    // Plugin data - Jay-specific metadata
    pluginData?: {
        [key: string]: string;
    };

    // Allow additional properties
    [key: string]: any;
};
