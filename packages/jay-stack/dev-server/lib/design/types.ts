export interface VendorAdapter {
    vendorId: string;
    
    /**
     * Converts the raw vendor JSON into a Jay HTML string.
     */
    convert(data: any): Promise<string>;
    
    /**
     * Optional: Validate the payload structure before saving.
     */
    validate?(data: any): boolean;
}

