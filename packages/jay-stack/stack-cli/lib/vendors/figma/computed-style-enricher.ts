/**
 * Computed style enricher using Playwright headless browser.
 *
 * Extracts getComputedStyle() + getBoundingClientRect() for all elements with
 * data-jay-sid attributes (compiler-injected source IDs, format "line:col").
 * Closes CSS fidelity gaps that static parsing cannot solve: cascade,
 * inheritance, shorthand expansion, computed values.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
export async function enrichWithComputedStyles(options: EnricherOptions): Promise<EnricherResult> {
    const emptyResult: EnricherResult = {
        merged: new Map(),
        perScenario: new Map(),
        scenarios: [],
        screenshots: new Map(),
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
            return {
                merged: cached,
                perScenario: new Map(),
                scenarios: [],
                screenshots: new Map(),
            };
        }
    }

    try {
        // Dynamic import of playwright
        const { chromium } = await import('playwright');

        // Launch headless browser
        const browser = await chromium.launch({
            headless: true,
            timeout: options.timeout ?? 30000,
        });

        try {
            const context = await browser.newContext({
                viewport: { width: 1280, height: 900 },
            });
            const page = await context.newPage();

            const timeout = options.timeout ?? 30000;
            page.setDefaultTimeout(timeout);

            const scenarios =
                options.scenarios && options.scenarios.length > 0
                    ? options.scenarios
                    : [{ id: 'default', contractValues: {}, queryString: '' }];

            const mergedStyleMap = new Map<string, ComputedStyleData>();
            const perScenarioMaps = new Map<string, ComputedStyleMap>();
            const screenshots = new Map<string, string>();

            if (options.screenshotDir) {
                mkdirSync(options.screenshotDir, { recursive: true });
            }

            for (const scenario of scenarios) {
                const scenarioStart = Date.now();
                const url = `${options.devServerUrl}${options.pageRoute}${scenario.queryString}`;
                console.log(`[ComputedStyles] Navigating to ${url} (scenario: ${scenario.id})`);

                try {
                    await page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout,
                    });
                    // Wait for compiler-injected source IDs to appear (indicates rendering is complete)
                    try {
                        await page.waitForSelector('[data-jay-sid]', { timeout: 10000 });
                    } catch {
                        console.warn(
                            `[ComputedStyles] No [data-jay-sid] elements found after 10s — page may not have source IDs enabled`,
                        );
                    }
                    // Wait for stylesheets to load and apply (CSS affects flex layout, bounding rects)
                    try {
                        await page.waitForLoadState('networkidle', { timeout: 5000 });
                    } catch {
                        // networkidle timeout is non-fatal; styles may still be loaded
                        await page.waitForTimeout(500);
                    }

                    if (options.screenshotDir) {
                        const safeName = scenario.id.replace(/[^a-zA-Z0-9_-]/g, '_');
                        const screenshotPath = join(
                            options.screenshotDir,
                            `screenshot-${safeName}.png`,
                        );
                        await page.screenshot({ path: screenshotPath, fullPage: true });
                        screenshots.set(scenario.id, screenshotPath);
                        console.log(`[ComputedStyles] Screenshot saved: ${screenshotPath}`);
                    }

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
            return { merged: mergedStyleMap, perScenario: perScenarioMaps, scenarios, screenshots };
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
    _variantContext?: string,
): Promise<ComputedStyleMap> {
    const extractedData = await page.evaluate(() => {
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
            'column-gap',
            'row-gap',
            'grid-template-columns',
            'grid-template-rows',
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
            'background-image',
            'text-align',
            'overflow',
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
            'font-style',
            'filter',
            'backdrop-filter',
        ];

        const result: Array<{
            key: string;
            styles: Record<string, string>;
            boundingRect: { x: number; y: number; width: number; height: number };
        }> = [];

        // Single pass: all elements with data-jay-sid (compiler-injected source IDs)
        const elements = document.querySelectorAll('[data-jay-sid]');

        for (const element of Array.from(elements)) {
            const jaySid = element.getAttribute('data-jay-sid');
            if (!jaySid) continue;

            const htmlElement = element as any;
            const computedStyle = window.getComputedStyle(htmlElement);
            const rect = htmlElement.getBoundingClientRect();

            const styles: Record<string, string> = {};
            for (const prop of properties) {
                const value = computedStyle.getPropertyValue(prop);
                if (value && value !== 'none' && value !== 'normal') {
                    styles[prop] = value;
                }
            }

            result.push({
                key: jaySid,
                styles,
                boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            });
        }

        return result;
    });

    const styleMap = new Map<string, ComputedStyleData>();
    for (const item of extractedData) {
        styleMap.set(item.key, {
            styles: item.styles,
            boundingRect: item.boundingRect,
        });
    }

    // Diagnostic: log flex containers to verify CSS is loaded at extraction time
    let flexCount = 0;
    for (const [, data] of styleMap) {
        if (data.styles['display'] === 'flex' || data.styles['display'] === 'inline-flex') {
            flexCount++;
        }
    }
    if (flexCount > 0) {
        console.log(`[ComputedStyles] ${flexCount} flex containers detected (CSS loaded)`);
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
 * Compute an integer that satisfies a comparison operator against a threshold.
 * Returns the simplest integer that makes the expression true.
 */
function valueForComparison(op: string, threshold: number): number {
    switch (op) {
        case '>':
            return threshold + 1;
        case '>=':
            return threshold;
        case '<':
            return threshold - 1;
        case '<=':
            return threshold;
        default:
            return threshold;
    }
}

/**
 * Determine the override value that makes a single condition token TRUE.
 *
 * Handles every condition pattern found in real jay-html templates:
 * - Boolean truthy/negated:  `isSearching` → "true", `!isSearching` → "false"
 * - String truthy/negated:   `brand.name` → "Sample", `!imageUrl` → "" (empty)
 * - Number truthy:           `itemCount` → "1"
 * - Equality:                `mediaType == IMAGE` → "IMAGE"
 * - Inequality:              `mediaType != IMAGE` → first alternative enum value
 * - Comparison:              `itemCount > 0` → "1", `count >= 5` → "5"
 */
function tokenToOverrideValue(
    token: ReturnType<typeof tokenizeCondition>[number],
    contractTags: ContractTag[] | undefined,
): { tagPath: string; value: string } | undefined {
    if (token.isComputed || token.path.length === 0) return undefined;

    const tagPath = token.path.join('.');
    const tag = findEditorProtocolTag(token.path, contractTags);
    const dataType = parseDataTypeString(tag?.dataType);

    if (token.operator === '==' && token.comparedValue != null) {
        return { tagPath, value: token.comparedValue };
    }

    if (token.operator === '!=' && token.comparedValue != null) {
        if (dataType.kind === 'enum' && dataType.enumValues) {
            const other = dataType.enumValues.find((v) => v !== token.comparedValue);
            if (other) return { tagPath, value: other };
        }
        if (dataType.kind === 'boolean') {
            return { tagPath, value: token.comparedValue === 'true' ? 'false' : 'true' };
        }
        return undefined;
    }

    // Comparison operators: >, <, >=, <=
    if (token.operator && token.comparedValue != null) {
        const threshold = parseFloat(token.comparedValue);
        if (!isNaN(threshold)) {
            const val = valueForComparison(token.operator, threshold);
            return { tagPath, value: String(val) };
        }
        return undefined;
    }

    // Truthy / negated (no operator)
    if (!token.operator) {
        if (dataType.kind === 'boolean') {
            return { tagPath, value: token.isNegated ? 'false' : 'true' };
        }
        if (dataType.kind === 'number') {
            return { tagPath, value: token.isNegated ? '0' : '1' };
        }
        if (dataType.kind === 'string') {
            return { tagPath, value: token.isNegated ? '' : 'Sample' };
        }
        // Unknown type — assume truthy needs "true", negated needs "false"
        // (best effort for tags not found in contract)
        return { tagPath, value: token.isNegated ? '' : 'true' };
    }

    return undefined;
}

/**
 * Generate variant scenarios driven by the actual `if` conditions in the template.
 *
 * Each `if` condition becomes exactly one scenario containing all the `vs.*`
 * overrides needed to make that condition true. Compound conditions
 * (e.g. `isSearching && hasResults`) produce a single scenario with multiple
 * overrides. This is neither linear nor combinatorial — it's **condition-driven**:
 * only the value combinations that the template actually checks are rendered.
 *
 * @param bodyDom - Parsed HTML body element
 * @param pageContract - Page contract with tag definitions
 * @param maxScenarios - Maximum number of scenarios to generate (default 16)
 * @returns Array of variant scenarios with vs.* query strings
 */
export function generateVariantScenarios(
    bodyDom: HTMLElement,
    pageContract: Contract | undefined,
    maxScenarios: number = 16,
): VariantScenario[] {
    if (!pageContract || !pageContract.tags || pageContract.tags.length === 0) {
        return [];
    }

    const ifConditions = new Set<string>();
    scanForIfAttributes(bodyDom, ifConditions);

    if (ifConditions.size === 0) {
        return [];
    }

    // Always include the default scenario
    const scenarios: VariantScenario[] = [{ id: 'default', contractValues: {}, queryString: '' }];

    // Dedup: avoid generating identical scenarios for the same override set
    const seenIds = new Set<string>(['default']);

    for (const condition of ifConditions) {
        if (scenarios.length >= maxScenarios) break;

        const tokens = tokenizeCondition(condition);
        if (tokens.length === 0) continue;

        // Build the set of overrides that make this condition true
        const overrides: Record<string, string> = {};
        let allResolved = true;

        for (const token of tokens) {
            const override = tokenToOverrideValue(token, pageContract.tags);
            if (!override) {
                allResolved = false;
                continue;
            }
            overrides[override.tagPath] = override.value;
        }

        if (Object.keys(overrides).length === 0) continue;

        // Build scenario ID from sorted overrides (deterministic)
        const sortedEntries = Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b));
        const scenarioId = sortedEntries.map(([k, v]) => `${k}=${v}`).join('&');

        if (seenIds.has(scenarioId)) continue;
        seenIds.add(scenarioId);

        const queryString =
            '?' + sortedEntries.map(([k, v]) => `vs.${k}=${encodeURIComponent(v)}`).join('&');

        const contractValues: Record<string, string | number | boolean> = {};
        for (const [k, v] of sortedEntries) contractValues[k] = v;

        scenarios.push({
            id: scenarioId,
            contractValues,
            queryString,
        });

        if (!allResolved) {
            console.log(
                `[ComputedStyles] Condition "${condition}" partially resolved (some tokens are computed expressions)`,
            );
        }
    }

    const conditionCount = ifConditions.size;
    const scenarioCount = scenarios.length - 1; // exclude default
    console.log(
        `[ComputedStyles] ${conditionCount} if condition(s) → ${scenarioCount} scenario(s) + default`,
    );
    for (const s of scenarios) {
        if (s.id !== 'default') {
            console.log(`[ComputedStyles]   ${s.id}  →  ${s.queryString}`);
        }
    }

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
