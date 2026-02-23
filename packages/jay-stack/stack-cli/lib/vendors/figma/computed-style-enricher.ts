/**
 * Computed style enricher using Playwright headless browser.
 * 
 * Extracts getComputedStyle() + getBoundingClientRect() for all elements with
 * data-figma-id attributes. Closes CSS fidelity gaps that static parsing cannot
 * solve: cascade, inheritance, shorthand expansion, computed values.
 */

import type {
    ComputedStyleMap,
    ComputedStyleData,
    EnricherOptions,
    VariantScenario,
} from './computed-style-types';

/**
 * Check if Playwright is available in the current environment.
 */
export function isPlaywrightAvailable(): boolean {
    try {
        require.resolve('playwright');
        return true;
    } catch {
        return false;
    }
}

/**
 * Enrich with computed styles using headless browser rendering.
 * 
 * @param options - Enricher options (page route, dev server URL, scenarios)
 * @returns Map from element key to computed style data
 * 
 * If Playwright is unavailable or rendering fails, returns empty map.
 * The IR builder will fall back to static resolution.
 */
export async function enrichWithComputedStyles(
    options: EnricherOptions
): Promise<ComputedStyleMap> {
    if (!isPlaywrightAvailable()) {
        console.warn('[ComputedStyles] Playwright not available, skipping enrichment');
        return new Map();
    }

    try {
        // Dynamic import of playwright
        const { chromium } = await import('playwright');

        // Launch headless browser
        const browser = await chromium.launch({
            headless: true,
            timeout: options.timeout ?? 5000,
        });

        try {
            const context = await browser.newContext();
            const page = await context.newPage();

            // Set timeout
            page.setDefaultTimeout(options.timeout ?? 5000);

            // Navigate to page
            const url = `${options.devServerUrl}${options.pageRoute}`;
            console.log(`[ComputedStyles] Navigating to ${url}`);

            await page.goto(url, { waitUntil: 'networkidle' });

            // Extract computed styles (Phase 3)
            const computedStyleMap = await extractComputedStyles(page);

            console.log(`[ComputedStyles] Enriched ${computedStyleMap.size} elements`);

            await context.close();
            return computedStyleMap;
        } finally {
            await browser.close();
        }
    } catch (error) {
        const err = error as Error;
        console.warn(`[ComputedStyles] Enrichment failed: ${err.message}`);
        console.warn('[ComputedStyles] Falling back to static resolution');
        return new Map();
    }
}

/**
 * Extract computed styles from a single page render.
 * 
 * @param page - Playwright Page instance
 * @param variantContext - Optional variant context for logging
 * @returns Map from element key to computed style data
 */
async function extractComputedStyles(
    page: any, // Playwright Page type
    variantContext?: string
): Promise<ComputedStyleMap> {
    // Extract computed styles for all elements with data-figma-id
    const extractedData = await page.evaluate(() => {
        // List of CSS properties to extract (relevant to Figma import)
        const properties = [
            'display',
            'position',
            'width',
            'height',
            'flex-grow',
            'flex-shrink',
            'flex-basis',
            'flex-direction',
            'justify-content',
            'align-items',
            'gap',
            'padding-top',
            'padding-right',
            'padding-bottom',
            'padding-left',
            'margin-top',
            'margin-right',
            'margin-bottom',
            'margin-left',
            'background-color',
            'color',
            'font-family',
            'font-size',
            'font-weight',
            'line-height',
            'letter-spacing',
            'border-top-width',
            'border-right-width',
            'border-bottom-width',
            'border-left-width',
            'border-top-color',
            'border-right-color',
            'border-bottom-color',
            'border-left-color',
            'border-top-left-radius',
            'border-top-right-radius',
            'border-bottom-right-radius',
            'border-bottom-left-radius',
            'opacity',
            'box-shadow',
            'text-decoration',
            'text-transform',
        ];

        const result: Array<{
            key: string;
            styles: Record<string, string>;
            boundingRect: { x: number; y: number; width: number; height: number };
        }> = [];

        // Query all elements with data-figma-id
        const elements = document.querySelectorAll('[data-figma-id]');

        for (const element of Array.from(elements)) {
            const figmaId = element.getAttribute('data-figma-id');
            if (!figmaId) continue;

            const htmlElement = element as HTMLElement;
            const computedStyle = window.getComputedStyle(htmlElement);
            const rect = htmlElement.getBoundingClientRect();

            const styles: Record<string, string> = {};
            for (const prop of properties) {
                const value = computedStyle.getPropertyValue(prop);
                if (value && value !== 'none' && value !== 'normal' && value !== '0px') {
                    styles[prop] = value;
                }
            }

            result.push({
                key: figmaId,
                styles,
                boundingRect: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                },
            });
        }

        return result;
    });

    // Build ComputedStyleMap from extracted data
    const styleMap = new Map<string, ComputedStyleData>();
    for (const item of extractedData) {
        styleMap.set(item.key, {
            styles: item.styles,
            boundingRect: item.boundingRect,
        });
    }

    return styleMap;
}

/**
 * Generate variant scenarios from page contract and if conditions.
 * 
 * Scans the page for `if` attributes and generates permutations of contract
 * values to render different variant states.
 * 
 * @param bodyDom - Parsed HTML body element
 * @param pageContract - Page contract with tag definitions
 * @param maxScenarios - Maximum number of scenarios to generate (default 12)
 * @returns Array of variant scenarios
 */
export function generateVariantScenarios(
    bodyDom: any,
    pageContract: any,
    maxScenarios: number = 12
): VariantScenario[] {
    // Phase 4: Variant scenario generation (deferred to Step 5.2)
    return [];
}
