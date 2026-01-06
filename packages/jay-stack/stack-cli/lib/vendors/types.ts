/**
 * Vendor Interface
 *
 * Each vendor (e.g., Figma, Sketch, Adobe XD) implements this interface
 * to provide conversion from their native format to Jay HTML format.
 */

export interface Vendor<TVendorDoc = any> {
    /**
     * The unique identifier for this vendor (e.g., 'figma', 'sketch', 'xd')
     */
    vendorId: string;

    /**
     * Convert vendor document to Jay HTML
     *
     * @param vendorDoc - The vendor's native document format (e.g., Figma SectionNode)
     * @param pageUrl - The page URL/route (e.g., '/home', '/products')
     * @returns Jay HTML string
     */
    convertToJayHtml(vendorDoc: TVendorDoc, pageUrl: string): Promise<string>;
}
