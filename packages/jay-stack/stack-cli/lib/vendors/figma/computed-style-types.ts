/**
 * Types for computed style enrichment.
 *
 * The enricher uses a headless browser to extract computed styles and layout
 * dimensions from rendered pages, closing the CSS fidelity gap that static
 * parsing cannot solve (cascade, inheritance, shorthand expansion, computed values).
 */

/**
 * Identity metadata for candidate disambiguation when multiple elements share a sid.
 */
export interface CandidateIdentity {
    tagName: string;
    /** Normalized class tokens (sorted, deduplicated). */
    classNameTokens: string;
    /** First 80 chars of textContent for text elements. */
    textSignal?: string;
}

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

    /**
     * Rendered text content from the browser DOM (textContent.trim()).
     * Used to replace template expressions with actual rendered values.
     */
    textContent?: string;

    /**
     * Rendered input value from the browser DOM (element.value).
     * Used to replace template expressions in input value/placeholder.
     */
    inputValue?: string;

    /**
     * Resolved image data extracted from rendered DOM.
     * For `<img>` elements: the browser-resolved `currentSrc`/`src`.
     * For background images: parsed `url(...)` values from computed `background-image`.
     */
    image?: {
        renderedSrc?: string;
        backgroundImageUrls?: string[];
        objectFit?: string;
        backgroundSize?: string;
    };

    /**
     * Identity metadata for sid collision disambiguation.
     */
    candidateIdentity?: CandidateIdentity;

    /**
     * Class-only safe baseline input (computed with inline style temporarily excluded).
     * Used for class-based diff baseline so export diff detects inline overrides.
     */
    classOnlyStyles?: Record<string, string>;
}

/**
 * Map from element key to computed style data.
 * Element key is data-jay-sid attribute (compiler-injected "line:col" source ID).
 */
export type ComputedStyleMap = Map<string, ComputedStyleData>;

/**
 * Map from element key to an ordered array of computed style data
 * for each rendered instance sharing that key. Used for repeaters
 * where multiple DOM elements share the same data-jay-sid.
 * Index 0 = first rendered item (template), index 1+ = additional items.
 */
export type RepeaterDataMap = Map<string, ComputedStyleData[]>;

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
 * Maps scenario ID to the computed styles extracted for that scenario.
 * Used to assign per-variant styles to COMPONENT nodes in the IR builder.
 */
export type ScenarioStyleMaps = Map<string, ComputedStyleMap>;

/**
 * Result of computed style enrichment, containing both a merged map
 * (for general use) and per-scenario maps (for variant-specific styles).
 */
export interface EnricherResult {
    merged: ComputedStyleMap;
    perScenario: ScenarioStyleMaps;
    scenarios: VariantScenario[];
    /** Paths to screenshots taken per scenario (scenario ID → file path). */
    screenshots: Map<string, string>;
    /** All rendered instances per sid, for repeater demo item extraction. */
    repeaterDataMap: RepeaterDataMap;
    /** Computed background-color of the page's <body> element (CSS color string). */
    bodyBackgroundColor?: string;
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

    /**
     * Directory to save screenshots in. If set, a full-page screenshot is
     * taken for each scenario after style extraction.
     */
    screenshotDir?: string;
}
