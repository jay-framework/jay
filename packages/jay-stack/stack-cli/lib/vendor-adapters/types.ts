/**
 * Types for the Vendor Adapter system
 *
 * This system allows external design editors (Figma, Wix, etc.) to export
 * their design documents to Jay and import them back for bi-directional sync.
 */

/**
 * Context provided to the adapter during conversion
 */
export interface ConversionContext {
    /** Absolute path to the page directory where files will be written */
    pageDirectory: string;

    /** The page URL/route (e.g., '/home', '/products/:id') */
    pageUrl: string;

    /** Project root path */
    projectRoot: string;

    /** Pages base path */
    pagesBase: string;
}

/**
 * Result of a conversion operation
 */
export interface ConversionResult {
    /** Whether the conversion was successful */
    success: boolean;

    /** The generated jay-html content */
    jayHtml?: string;

    /** Optional contract content to be written to page.jay-contract */
    contract?: string;

    /** Error message if conversion failed */
    error?: string;

    /** Validation warnings (non-fatal) */
    warnings?: string[];
}

/**
 * Base interface that all vendor adapters must implement
 *
 * @template TVendorDoc - The type of the vendor-specific document structure
 */
export interface VendorAdapter<TVendorDoc = unknown> {
    /**
     * The unique identifier for this vendor (e.g., 'figma', 'wix', 'penpot')
     */
    readonly vendorId: string;

    /**
     * Convert a vendor-specific document to Jay format
     *
     * @param vendorDoc - The vendor-specific document structure
     * @param context - Conversion context with paths and metadata
     * @returns Conversion result with jay-html and optional contract
     */
    convert(vendorDoc: TVendorDoc, context: ConversionContext): Promise<ConversionResult>;
}

/**
 * Registry for managing vendor adapters
 */
export class VendorAdapterRegistry {
    private adapters = new Map<string, VendorAdapter<any>>();

    /**
     * Register a new vendor adapter
     */
    register(adapter: VendorAdapter<any>): void {
        this.adapters.set(adapter.vendorId, adapter);
    }

    /**
     * Get an adapter by vendor ID
     */
    get(vendorId: string): VendorAdapter<any> | undefined {
        return this.adapters.get(vendorId);
    }

    /**
     * Check if an adapter is registered
     */
    has(vendorId: string): boolean {
        return this.adapters.has(vendorId);
    }

    /**
     * Get all registered vendor IDs
     */
    getVendorIds(): string[] {
        return Array.from(this.adapters.keys());
    }
}
