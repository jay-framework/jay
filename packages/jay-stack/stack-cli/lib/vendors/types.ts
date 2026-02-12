/**
 * Vendor Interface
 *
 * Each vendor (e.g., Figma, Sketch, Adobe XD) implements this interface
 * to provide conversion from their native format to Jay HTML format.
 */

import { Plugin, ProjectPage } from '@jay-framework/editor-protocol';
import type { JayHtmlSourceFile } from '@jay-framework/compiler-jay-html';

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

    /**
     * Convert a parsed jay-html source file to vendor document format (reverse conversion).
     * Optional - vendors that support import from jay-html implement this.
     *
     * This is called when a page has a jay-html file but no vendor JSON file,
     * enabling import into the design tool from jay-html source.
     * The jay-html is pre-parsed by the compiler's parseJayFile, giving the vendor
     * access to the full parsed body DOM, resolved headless imports, contracts, and CSS.
     *
     * @param parsedJayHtml - The compiler-parsed jay-html source file
     * @param pageUrl - The page URL/route (e.g., '/home', '/products')
     * @param projectPage - The project page info with contracts and used components
     * @param plugins - Available plugins with their contracts
     * @returns The vendor document that can be sent to the design tool plugin
     */
    convertFromJayHtml?(
        parsedJayHtml: JayHtmlSourceFile,
        pageUrl: string,
        projectPage: ProjectPage,
        plugins: Plugin[],
    ): Promise<TVendorDoc>;
}
