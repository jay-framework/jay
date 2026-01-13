/**
 * PageContractPath type definition and utilities
 * Matches the structure from jay-plugin-common
 */

export interface PageContractPath {
    pageUrl: string;           // e.g., "/products/:id"
    pluginName?: string;       // e.g., "@jay-framework/wix-stores" (only for plugin contracts)
    componentName?: string;    // e.g., "product-page" (only for plugin contracts)
}

/**
 * Helper to convert PageContractPath to string key for storage/lookup
 * Uses pipe (|) separator to distinguish between page URL and plugin parts
 */
export function pageContractPathToKey(path: PageContractPath): string {
    if (path.pluginName && path.componentName) {
        return `${path.pageUrl}|${path.pluginName}.${path.componentName}`;
    }
    return path.pageUrl;
}
