/**
 * Vendor Document Types
 *
 * This file defines the document types that each vendor expects when
 * calling the export API. Editor plugins should import these types
 * to ensure they send the correct format.
 *
 * Each vendor is responsible for defining and exporting their document type.
 */

/**
 * Figma Vendor Document Type
 *
 * The structure that Figma plugins must send when exporting.
 * This should match the type defined in the Figma vendor implementation.
 *
 * @example
 * ```typescript
 * import { FigmaVendorDocument } from '@jay-framework/editor-protocol';
 *
 * const vendorDoc: FigmaVendorDocument = {
 *   type: 'SECTION',
 *   name: 'My Page',
 *   children: [...]
 * };
 *
 * await editorProtocol.export({
 *   vendorId: 'figma',
 *   pageUrl: '/home',
 *   vendorDoc
 * });
 * ```
 */
export type FigmaVendorDocument = {
    type?: string;
    name?: string;
    children?: any[];
    // Add other Figma-specific fields as needed
    // TODO: Replace with actual Figma SectionNode structure from @figma/plugin-typings
};

/**
 * Union type of all vendor document types
 *
 * This can be used when you need to handle any vendor document.
 */
export type AnyVendorDocument = FigmaVendorDocument;

/**
 * Mapping of vendor IDs to their document types
 *
 * This provides type safety when working with specific vendors.
 */
export type VendorDocumentMap = {
    figma: FigmaVendorDocument;
};
