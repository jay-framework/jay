/**
 * Types for computed style enrichment.
 * 
 * The enricher uses a headless browser to extract computed styles and layout
 * dimensions from rendered pages, closing the CSS fidelity gap that static
 * parsing cannot solve (cascade, inheritance, shorthand expansion, computed values).
 */

/**
 * Computed styles and layout dimensions for a single element.
 * Extracted from browser via getComputedStyle() + getBoundingClientRect().
 */
export interface ComputedStyleData {
    /**
     * CSS property values extracted from getComputedStyle().
     * Only includes properties relevant to Figma import.
     */
    styles: Record<string, string>;

    /**
     * Layout dimensions from getBoundingClientRect().
     */
    boundingRect?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

/**
 * Map from element key to computed style data.
 * Element key is data-figma-id attribute or DOM path.
 */
export type ComputedStyleMap = Map<string, ComputedStyleData>;

/**
 * Variant scenario for multi-scenario rendering.
 * Used to render pages with different contract values (e.g., if conditions).
 */
export interface VariantScenario {
    /**
     * Scenario identifier (e.g., "mediaType=IMAGE", "default")
     */
    id: string;

    /**
     * Contract tag values for this scenario.
     * Maps tag path to value (e.g., { "product.mediaType": "IMAGE" })
     */
    contractValues: Record<string, string | number | boolean>;

    /**
     * Query string to append to page URL for this scenario.
     * Format: ?tag1=value1&tag2=value2
     */
    queryString: string;
}

/**
 * Options for computed style enrichment.
 */
export interface EnricherOptions {
    /**
     * Page route to render (e.g., "/product")
     */
    pageRoute: string;

    /**
     * Dev server URL (e.g., "http://localhost:3000")
     */
    devServerUrl: string;

    /**
     * Variant scenarios to render.
     * If empty, renders default scenario only.
     */
    scenarios?: VariantScenario[];

    /**
     * Timeout for browser rendering (milliseconds).
     * Default: 5000 (5 seconds)
     */
    timeout?: number;

    /**
     * Maximum number of scenarios to render.
     * Default: 12
     */
    maxScenarios?: number;
}
