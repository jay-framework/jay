/**
 * Computed style enricher using Playwright headless browser.
 *
 * Extracts getComputedStyle() + getBoundingClientRect() for all elements with
 * data-figma-id attributes. Closes CSS fidelity gaps that static parsing cannot
 * solve: cascade, inheritance, shorthand expansion, computed values.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { HTMLElement } from 'node-html-parser';
import type { Contract } from '@jay-framework/editor-protocol';
import type {
    ComputedStyleMap,
    ComputedStyleData,
    EnricherOptions,
    VariantScenario,
} from './computed-style-types';

/**
 * Check if Playwright is available in the current environment.
 * We simply try to import it - if it fails, we'll catch it in the enricher.
 */
export function isPlaywrightAvailable(): boolean {
    // In a monorepo with yarn workspaces, require.resolve may not work correctly
    // due to hoisting. We'll just assume it's available if we're in enrichment mode.
    // The actual import('playwright') will fail gracefully if truly unavailable.
    return true;
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
    options: EnricherOptions,
): Promise<ComputedStyleMap> {
    const startTime = Date.now();

    // isPlaywrightAvailable check removed - we'll try to import and catch errors properly
    console.log(
        '[ComputedStyles] DEBUG: Starting enrichment, will attempt dynamic import of playwright...',
    );

    // Check cache first (if enabled via env var)
    const enableCache = process.env.ENABLE_COMPUTED_STYLES_CACHE === '1';
    if (enableCache) {
        const cached = tryReadCache(options.pageRoute, options.scenarios);
        if (cached) {
            console.log(
                `[ComputedStyles] ✓ Cache hit for ${options.pageRoute} (${cached.size} elements)`,
            );
            return cached;
        }
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
            const timeout = options.timeout ?? 5000;
            page.setDefaultTimeout(timeout);

            const scenarios =
                options.scenarios && options.scenarios.length > 0
                    ? options.scenarios
                    : [{ id: 'default', contractValues: {}, queryString: '' }];

            const mergedStyleMap = new Map<string, ComputedStyleData>();
            let totalElements = 0;

            // Render each scenario
            for (const scenario of scenarios) {
                const scenarioStart = Date.now();
                const url = `${options.devServerUrl}${options.pageRoute}${scenario.queryString}`;
                console.log(`[ComputedStyles] Navigating to ${url} (scenario: ${scenario.id})`);

                try {
                    await page.goto(url, {
                        waitUntil: 'networkidle',
                        timeout,
                    });

                    // Extract computed styles for this scenario
                    const scenarioStyleMap = await extractComputedStyles(page, scenario.id);
                    totalElements = scenarioStyleMap.size;

                    // Merge into main map
                    for (const [key, data] of scenarioStyleMap) {
                        mergedStyleMap.set(key, data);
                    }

                    const scenarioDuration = Date.now() - scenarioStart;
                    console.log(
                        `[ComputedStyles] Scenario '${scenario.id}' completed in ${scenarioDuration}ms (${scenarioStyleMap.size} elements)`,
                    );
                } catch (error) {
                    const err = error as Error;
                    console.warn(
                        `[ComputedStyles] Scenario '${scenario.id}' failed: ${err.message}`,
                    );
                    // Continue with other scenarios
                }
            }

            const totalDuration = Date.now() - startTime;
            console.log(
                `[ComputedStyles] ✓ Enriched ${mergedStyleMap.size} total elements across ${scenarios.length} scenario(s) in ${totalDuration}ms`,
            );

            // Warn if enrichment took too long
            if (totalDuration > 30000) {
                console.warn(
                    `[ComputedStyles] ⚠ Enrichment took ${(totalDuration / 1000).toFixed(1)}s (budget: 30s for complex pages)`,
                );
            } else if (totalDuration > 5000) {
                console.log(
                    `[ComputedStyles] Enrichment took ${(totalDuration / 1000).toFixed(1)}s (within budget)`,
                );
            }

            // Write to cache if enabled
            if (enableCache) {
                tryWriteCache(options.pageRoute, options.scenarios, mergedStyleMap);
            }

            await context.close();
            return mergedStyleMap;
        } finally {
            await browser.close();
        }
    } catch (error) {
        const err = error as Error;
        const duration = Date.now() - startTime;
        console.warn(`[ComputedStyles] ✗ Enrichment failed after ${duration}ms: ${err.message}`);
        console.warn('[ComputedStyles] Falling back to static resolution');
        return new Map();
    }
}

/**
 * Generate cache key from page route and scenarios.
 */
function getCacheKey(pageRoute: string, scenarios?: VariantScenario[]): string {
    const scenarioKey =
        scenarios && scenarios.length > 0 ? scenarios.map((s) => s.id).join('_') : 'default';
    return createHash('md5').update(`${pageRoute}:${scenarioKey}`).digest('hex').slice(0, 16);
}

/**
 * Get cache file path for a page route.
 */
function getCachePath(pageRoute: string, scenarios?: VariantScenario[]): string {
    const cacheKey = getCacheKey(pageRoute, scenarios);
    const tmpDir = process.env.TMPDIR || '/tmp';
    return join(tmpDir, `jay-computed-styles-${cacheKey}.json`);
}

/**
 * Try to read computed styles from cache.
 * Returns undefined if cache miss or stale (>24h).
 */
function tryReadCache(
    pageRoute: string,
    scenarios?: VariantScenario[],
): ComputedStyleMap | undefined {
    try {
        const cachePath = getCachePath(pageRoute, scenarios);
        if (!existsSync(cachePath)) {
            return undefined;
        }

        const content = readFileSync(cachePath, 'utf-8');
        const cached = JSON.parse(content);

        // Check if cache is stale (>24h)
        const age = Date.now() - cached.timestamp;
        if (age > 24 * 60 * 60 * 1000) {
            console.log(
                `[ComputedStyles] Cache expired (age: ${(age / 1000 / 60 / 60).toFixed(1)}h)`,
            );
            return undefined;
        }

        // Reconstruct Map from serialized data
        const styleMap = new Map<string, ComputedStyleData>();
        for (const [key, data] of Object.entries(cached.styles)) {
            styleMap.set(key, data as ComputedStyleData);
        }

        return styleMap;
    } catch (error) {
        // Cache read error - ignore and recompute
        return undefined;
    }
}

/**
 * Try to write computed styles to cache.
 */
function tryWriteCache(
    pageRoute: string,
    scenarios: VariantScenario[] | undefined,
    styleMap: ComputedStyleMap,
): void {
    try {
        const cachePath = getCachePath(pageRoute, scenarios);
        const serialized = {
            version: '1.0',
            timestamp: Date.now(),
            pageRoute,
            scenarios: scenarios?.map((s) => s.id) || ['default'],
            styles: Object.fromEntries(styleMap),
        };
        writeFileSync(cachePath, JSON.stringify(serialized, null, 2), 'utf-8');
        console.log(`[ComputedStyles] Cache written to ${cachePath}`);
    } catch (error) {
        // Cache write error - non-fatal, just log
        console.warn(`[ComputedStyles] Failed to write cache: ${(error as Error).message}`);
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
    variantContext?: string,
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

        /**
         * Generate deterministic DOM path for an element.
         * Format: tag:nth-child(N) > tag:nth-child(M) > ...
         */
        function generateDomPath(element: any): string {
            const segments: string[] = [];
            let current: any = element;

            while (current && current !== document.body) {
                const parent = current.parentElement;
                if (!parent) break;

                const siblings = Array.from(parent.children);
                const index = siblings.indexOf(current) + 1;
                const tag = current.tagName.toLowerCase();

                // Add semantic anchors if available
                const id = current.getAttribute('id');
                const ref = current.getAttribute('ref');

                if (id) {
                    segments.unshift(`${tag}#${id}`);
                } else if (ref) {
                    segments.unshift(`${tag}[ref="${ref}"]`);
                } else {
                    segments.unshift(`${tag}:nth-child(${index})`);
                }

                current = parent;
            }

            return segments.join(' > ');
        }

        const result: Array<{
            key: string;
            styles: Record<string, string>;
            boundingRect: { x: number; y: number; width: number; height: number };
        }> = [];

        // Query all elements with data-figma-id
        const elementsWithFigmaId = document.querySelectorAll('[data-figma-id]');

        for (const element of Array.from(elementsWithFigmaId)) {
            const figmaId = element.getAttribute('data-figma-id');
            if (!figmaId) continue;

            const htmlElement = element as any;
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

        // Also query elements without data-figma-id (developer-authored pages)
        // Use DOM path as fallback key
        const allElements = document.querySelectorAll('body *');

        for (const element of Array.from(allElements)) {
            if (element.getAttribute('data-figma-id')) continue; // Skip elements with figma-id

            const htmlElement = element as any;
            const computedStyle = window.getComputedStyle(htmlElement);
            const rect = htmlElement.getBoundingClientRect();

            const styles: Record<string, string> = {};
            for (const prop of properties) {
                const value = computedStyle.getPropertyValue(prop);
                if (value && value !== 'none' && value !== 'normal' && value !== '0px') {
                    styles[prop] = value;
                }
            }

            const domPath = generateDomPath(element);

            result.push({
                key: domPath,
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
    bodyDom: HTMLElement,
    pageContract: Contract | undefined,
    maxScenarios: number = 12,
): VariantScenario[] {
    // TODO: Implement full scenario generation in a follow-up
    // For now, return empty array (only default scenario will be rendered)
    // This requires parsing Contract dataType strings to extract enum values

    if (!pageContract || !pageContract.tags || pageContract.tags.length === 0) {
        return [];
    }

    // Scan for if attributes to see if we need scenarios
    const ifConditions = new Set<string>();
    scanForIfAttributes(bodyDom, ifConditions);

    if (ifConditions.size === 0) {
        return [];
    }

    console.log(
        `[ComputedStyles] Found ${ifConditions.size} if conditions, but scenario generation not yet implemented`,
    );
    console.log(`[ComputedStyles] Will render default scenario only`);
    return [];
}

/**
 * Recursively scan HTML element for if attributes.
 */
function scanForIfAttributes(element: HTMLElement, conditions: Set<string>): void {
    const ifAttr = element.getAttribute('if');
    if (ifAttr) {
        conditions.add(ifAttr);
    }

    if (element.childNodes) {
        for (const child of element.childNodes) {
            if ((child as any).rawTagName) {
                scanForIfAttributes(child as HTMLElement, conditions);
            }
        }
    }
}
