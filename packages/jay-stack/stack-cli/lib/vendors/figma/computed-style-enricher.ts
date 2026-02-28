/**
 * Computed style enricher using Playwright headless browser.
 *
 * Extracts getComputedStyle() + getBoundingClientRect() for all elements with
 * data-figma-id attributes. Closes CSS fidelity gaps that static parsing cannot
 * solve: cascade, inheritance, shorthand expansion, computed values.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import type { HTMLElement } from 'node-html-parser';
import type { Contract, ContractTag } from '@jay-framework/editor-protocol';
import type {
    ComputedStyleMap,
    ComputedStyleData,
    EnricherOptions,
    EnricherResult,
    VariantScenario,
} from './computed-style-types';
import { tokenizeCondition } from './condition-tokenizer';

/**
 * Check if Playwright is available in the current environment.
 * Uses module resolution so we can skip enrichment when dependency is missing.
 */
export function isPlaywrightAvailable(): boolean {
    try {
        const require = createRequire(import.meta.url);
        require.resolve('playwright');
        return true;
    } catch {
        return false;
    }
}

/**
 * Enrich with computed styles using headless browser rendering.
 *
 * Returns an EnricherResult containing:
 * - merged: all styles merged across scenarios (backward-compatible)
 * - perScenario: per-scenario style maps for variant-specific style assignment
 * - scenarios: the scenarios that were rendered
 *
 * If Playwright is unavailable or rendering fails, returns empty result.
 * The IR builder will fall back to static resolution.
 */
export async function enrichWithComputedStyles(
    options: EnricherOptions,
): Promise<EnricherResult> {
    const emptyResult: EnricherResult = {
        merged: new Map(),
        perScenario: new Map(),
        scenarios: [],
    };
    const startTime = Date.now();

    if (process.env.ENABLE_COMPUTED_STYLES === '0') {
        return emptyResult;
    }

    if (!isPlaywrightAvailable()) {
        console.warn(
            '[ComputedStyles] Computed style enrichment requires playwright. Please run: npm install -D playwright',
        );
        console.warn('[ComputedStyles] Falling back to static resolution');
        return emptyResult;
    }

    // Check cache first (if enabled via env var)
    const enableCache = process.env.ENABLE_COMPUTED_STYLES_CACHE === '1';
    if (enableCache) {
        const cached = tryReadCache(options.pageRoute, options.scenarios);
        if (cached) {
            console.log(
                `[ComputedStyles] ✓ Cache hit for ${options.pageRoute} (${cached.size} elements)`,
            );
            return { merged: cached, perScenario: new Map(), scenarios: [] };
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
            const perScenarioMaps = new Map<string, ComputedStyleMap>();

            for (const scenario of scenarios) {
                const scenarioStart = Date.now();
                const url = `${options.devServerUrl}${options.pageRoute}${scenario.queryString}`;
                console.log(`[ComputedStyles] Navigating to ${url} (scenario: ${scenario.id})`);

                try {
                    await page.goto(url, {
                        waitUntil: 'networkidle',
                        timeout,
                    });

                    const scenarioStyleMap = await extractComputedStyles(page, scenario.id);

                    perScenarioMaps.set(scenario.id, scenarioStyleMap);

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
                }
            }

            const totalDuration = Date.now() - startTime;
            console.log(
                `[ComputedStyles] ✓ Enriched ${mergedStyleMap.size} total elements across ${scenarios.length} scenario(s) in ${totalDuration}ms`,
            );

            if (totalDuration > 30000) {
                console.warn(
                    `[ComputedStyles] ⚠ Enrichment took ${(totalDuration / 1000).toFixed(1)}s (budget: 30s for complex pages)`,
                );
            } else if (totalDuration > 5000) {
                console.log(
                    `[ComputedStyles] Enrichment took ${(totalDuration / 1000).toFixed(1)}s (within budget)`,
                );
            }

            if (enableCache) {
                tryWriteCache(options.pageRoute, options.scenarios, mergedStyleMap);
            }

            await context.close();
            return { merged: mergedStyleMap, perScenario: perScenarioMaps, scenarios };
        } finally {
            await browser.close();
        }
    } catch (error) {
        const err = error as Error;
        const duration = Date.now() - startTime;
        const missingPlaywright = /Cannot find (package|module) 'playwright'/.test(err.message);
        if (missingPlaywright) {
            console.warn(
                '[ComputedStyles] Computed style enrichment requires playwright. Please run: npm install -D playwright',
            );
        }
        console.warn(`[ComputedStyles] ✗ Enrichment failed after ${duration}ms: ${err.message}`);
        console.warn('[ComputedStyles] Falling back to static resolution');
        return emptyResult;
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
            'grid-template-columns',
            'flex-wrap',
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

    // Normalize CSS-selector keys to index-based keys to match buildDomPath format.
    // The browser wraps content in <div id="target">, so enricher keys look like
    // "div#target > div:nth-child(1) > header:nth-child(1)" while the IR builder
    // produces "body>0>0". Add index-based aliases so lookups succeed.
    const targetPrefix = /^div#target\s*>\s*/;
    for (const [key, data] of Array.from(styleMap.entries())) {
        if (!targetPrefix.test(key)) continue;

        const pathAfterTarget = key.replace(targetPrefix, '');
        const segments = pathAfterTarget.split(/\s*>\s*/);
        const indices: number[] = [];
        let valid = true;

        for (const segment of segments) {
            const nthMatch = segment.match(/:nth-child\((\d+)\)/);
            if (nthMatch) {
                indices.push(parseInt(nthMatch[1], 10) - 1);
            } else {
                valid = false;
                break;
            }
        }

        if (valid && indices.length > 0) {
            const indexKey = `body>${indices.join('>')}`;
            if (!styleMap.has(indexKey)) {
                styleMap.set(indexKey, data);
            }
        }
    }

    return styleMap;
}

/**
 * Parse a dataType string from editor-protocol Contract into structured info.
 * Handles: "string", "number", "boolean", "enum (val1 | val2 | ...)"
 */
export function parseDataTypeString(dataType: string | undefined): {
    kind: 'boolean' | 'enum' | 'string' | 'number' | 'other';
    enumValues?: string[];
} {
    if (!dataType) return { kind: 'other' };
    const trimmed = dataType.trim().toLowerCase();
    if (trimmed === 'boolean') return { kind: 'boolean' };
    if (trimmed === 'string') return { kind: 'string' };
    if (trimmed === 'number') return { kind: 'number' };

    // "enum (val1 | val2 | val3)" or "enum(val1 | val2)"
    const enumMatch = dataType.match(/^enum\s*\(([^)]+)\)/i);
    if (enumMatch) {
        const values = enumMatch[1]
            .split('|')
            .map((v) => v.trim())
            .filter(Boolean);
        if (values.length > 0) return { kind: 'enum', enumValues: values };
    }
    return { kind: 'other' };
}

/**
 * Find a contract tag by path in the editor-protocol Contract.
 * Uses case-insensitive comparison for tag names.
 */
function findEditorProtocolTag(
    path: string[],
    tags: ContractTag[] | undefined,
): ContractTag | undefined {
    if (!tags || path.length === 0) return undefined;

    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        const matchingTag = tags.find(
            (t) => t.tag.toLowerCase().replace(/\s+/g, '') === segment.toLowerCase(),
        );
        if (!matchingTag) return undefined;
        if (i === path.length - 1) return matchingTag;
        tags = matchingTag.tags;
    }
    return undefined;
}

/**
 * Represents a variant dimension: a contract tag that can take discrete values
 * and is used in `if` conditions in the template.
 */
interface VariantDimension {
    tagPath: string;
    dataType: ReturnType<typeof parseDataTypeString>;
    values: string[];
}

/**
 * Generate variant scenarios from page contract and if conditions.
 *
 * Scans the page for `if` attributes, cross-references with contract tags,
 * and generates one scenario per discrete value (linear, not combinatorial).
 * Uses `vs.*` query param format from the viewstate-query-params feature
 * so the dev server renders each scenario with the correct viewState.
 *
 * @param bodyDom - Parsed HTML body element
 * @param pageContract - Page contract with tag definitions
 * @param maxScenarios - Maximum number of scenarios to generate (default 12)
 * @returns Array of variant scenarios with vs.* query strings
 */
export function generateVariantScenarios(
    bodyDom: HTMLElement,
    pageContract: Contract | undefined,
    maxScenarios: number = 12,
): VariantScenario[] {
    if (!pageContract || !pageContract.tags || pageContract.tags.length === 0) {
        return [];
    }

    const ifConditions = new Set<string>();
    scanForIfAttributes(bodyDom, ifConditions);

    if (ifConditions.size === 0) {
        return [];
    }

    // Extract tag paths used in if conditions
    const referencedPaths = new Set<string>();
    for (const condition of ifConditions) {
        const tokens = tokenizeCondition(condition);
        for (const token of tokens) {
            if (token.isComputed || token.path.length === 0) continue;
            referencedPaths.add(token.path.join('.'));
        }
    }

    if (referencedPaths.size === 0) {
        return [];
    }

    // Build variant dimensions from referenced tags
    const dimensions: VariantDimension[] = [];
    for (const pathStr of referencedPaths) {
        const pathParts = pathStr.split('.');
        const tag = findEditorProtocolTag(pathParts, pageContract.tags);
        if (!tag) continue;

        const dataType = parseDataTypeString(tag.dataType);
        const values: string[] = [];

        if (dataType.kind === 'boolean') {
            values.push('true', 'false');
        } else if (dataType.kind === 'enum' && dataType.enumValues) {
            values.push(...dataType.enumValues);
        }

        if (values.length > 0) {
            dimensions.push({ tagPath: pathStr, dataType, values });
        }
    }

    if (dimensions.length === 0) {
        console.log(
            `[ComputedStyles] Found ${ifConditions.size} if conditions but no boolean/enum tags to generate scenarios from`,
        );
        return [];
    }

    // Generate scenarios: one per value per dimension (linear, not combinatorial)
    const scenarios: VariantScenario[] = [];

    // Always include the default scenario first
    scenarios.push({
        id: 'default',
        contractValues: {},
        queryString: '',
    });

    for (const dim of dimensions) {
        for (const value of dim.values) {
            if (scenarios.length >= maxScenarios) break;

            const scenarioId = `${dim.tagPath}=${value}`;
            const queryString = `?vs.${dim.tagPath}=${encodeURIComponent(value)}`;

            scenarios.push({
                id: scenarioId,
                contractValues: { [dim.tagPath]: value },
                queryString,
            });
        }
        if (scenarios.length >= maxScenarios) break;
    }

    console.log(
        `[ComputedStyles] Generated ${scenarios.length} variant scenarios from ${dimensions.length} dimension(s): ${dimensions.map((d) => d.tagPath).join(', ')}`,
    );

    return scenarios;
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
