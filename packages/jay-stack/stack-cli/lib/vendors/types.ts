/**
 * Vendor Interface
 *
 * Each vendor (e.g., Figma, Sketch, Adobe XD) implements this interface
 * to provide conversion from their native format to Jay HTML format.
 */

import { Plugin, ProjectPage } from '@jay-framework/editor-protocol';

/**
 * Result of vendor conversion containing body HTML, fonts, and contract data
 */
export interface VendorConversionResult {
    /**
     * The body HTML content (without <html>, <head>, or <body> tags)
     */
    bodyHtml: string;

    /**
     * Set of font family names used in the document
     */
    fontFamilies: Set<string>;

    /**
     * Optional contract data for the page
     * If provided, will be used to generate the jay-data script tag
     */
    contractData?: {
        /**
         * Contract name
         */
        name: string;
        /**
         * Contract tags in YAML format
         */
        tagsYaml: string;
    };
}

export interface Vendor<TVendorDoc = any> {
    /**
     * The unique identifier for this vendor (e.g., 'figma', 'sketch', 'xd')
     */
    vendorId: string;

    /**
     * Convert vendor document to body HTML with metadata
     *
     * @param vendorDoc - The vendor's native document format (e.g., Figma SectionNode)
     * @param pageUrl - The page URL/route (e.g., '/home', '/products')
     * @returns Conversion result with body HTML, fonts, and contract data
     */
    convertToBodyHtml(
        vendorDoc: TVendorDoc,
        pageUrl: string,
        projectPage: ProjectPage,
        plugins: Plugin[],
    ): Promise<VendorConversionResult>;
}
