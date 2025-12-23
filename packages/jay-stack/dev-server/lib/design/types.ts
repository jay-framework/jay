export interface VendorAdapter<T = any> {
    vendorId: string;

    /**
     * Converts the raw vendor JSON into a Jay HTML string.
     */
    convert(data: T, contractContext: ContractContext): Promise<string>;

    /**
     * Optional: Validate the payload structure before saving.
     */
    validate?(data: T): boolean;
}

export interface ContractContext {
    pageUrl: string;
    /** Complete jay-data script tag, ready to inject into HTML head */
    contractScript: string;
}
