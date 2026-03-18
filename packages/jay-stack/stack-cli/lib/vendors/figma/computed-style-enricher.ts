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
import type { ContractTag } from '@jay-framework/editor-protocol';
import type {
    ComputedStyleMap,
    ComputedStyleData,
    RepeaterDataMap,
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
        repeaterDataMap: new Map(),
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
                repeaterDataMap: new Map(),
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
            const mergedRepeaterDataMap: RepeaterDataMap = new Map();
            const perScenarioMaps = new Map<string, ComputedStyleMap>();
            const screenshots = new Map<string, string>();

            if (options.screenshotDir) {
                mkdirSync(options.screenshotDir, { recursive: true });
            }

            for (const scenario of scenarios) {
                const scenarioStart = Date.now();
                const url = buildPreviewScenarioUrl(
                    options.devServerUrl,
                    options.pageRoute,
                    scenario.queryString,
                );
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

                    const { styleMap: scenarioStyleMap, repeaterDataMap: scenarioRepeaterMap } =
                        await extractComputedStyles(page, scenario.id);

                    perScenarioMaps.set(scenario.id, scenarioStyleMap);

                    for (const [key, data] of scenarioStyleMap) {
                        if (!mergedStyleMap.has(key)) {
                            mergedStyleMap.set(key, data);
                        }
                    }

                    // Merge repeater data (default scenario only — repeaters don't vary by variant)
                    if (scenario.id === 'default') {
                        for (const [key, list] of scenarioRepeaterMap) {
                            mergedRepeaterDataMap.set(key, list);
                        }
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
            return {
                merged: mergedStyleMap,
                perScenario: perScenarioMaps,
                scenarios,
                screenshots,
                repeaterDataMap: mergedRepeaterDataMap,
            };
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
 * Build a scenario URL that always enables preview mode.
 *
 * Preview mode forces the dev server to bypass slow-render cache so Playwright
 * always sees the latest render output from disk.
 */
export function buildPreviewScenarioUrl(
    devServerUrl: string,
    pageRoute: string,
    scenarioQueryString: string,
): string {
    const normalizedBase = devServerUrl.endsWith('/') ? devServerUrl : `${devServerUrl}/`;
    const url = new URL(pageRoute, normalizedBase);

    const scenarioParams = new URLSearchParams(
        scenarioQueryString.startsWith('?') ? scenarioQueryString.slice(1) : scenarioQueryString,
    );
    for (const [key, value] of scenarioParams.entries()) {
        url.searchParams.set(key, value);
    }

    url.searchParams.set('preview', '1');
    return url.toString();
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
): Promise<{ styleMap: ComputedStyleMap; repeaterDataMap: RepeaterDataMap }> {
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
            'object-fit',
            'background-size',
        ];

        const SAFE_BASELINE_PROPS = [
            'background-color',
            'background-image',
            'color',
            'border-top-color',
            'border-right-color',
            'border-bottom-color',
            'border-left-color',
            'border-top-width',
            'border-right-width',
            'border-bottom-width',
            'border-left-width',
            'border-top-style',
            'border-right-style',
            'border-bottom-style',
            'border-left-style',
            'opacity',
        ];

        const result: Array<{
            key: string;
            styles: Record<string, string>;
            boundingRect: { x: number; y: number; width: number; height: number };
            textContent?: string;
            inputValue?: string;
            image?: {
                renderedSrc?: string;
                backgroundImageUrls?: string[];
                objectFit?: string;
                backgroundSize?: string;
            };
            candidateIdentity?: { tagName: string; classNameTokens: string; textSignal?: string };
            classOnlyStyles?: Record<string, string>;
        }> = [];

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
                if (value && value !== 'normal') {
                    if (value === 'none' && prop !== 'display') continue;
                    styles[prop] = value;
                }
            }

            let image: (typeof result)[0]['image'] | undefined;

            if (htmlElement.tagName === 'IMG') {
                const imgEl = htmlElement as any;
                const renderedSrc = imgEl.currentSrc || imgEl.src;
                if (renderedSrc) {
                    image = {
                        renderedSrc,
                        objectFit: computedStyle.getPropertyValue('object-fit') || undefined,
                    };
                }
            }

            const bgImage = computedStyle.getPropertyValue('background-image');
            if (bgImage && bgImage !== 'none') {
                const urlMatches = [...bgImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
                const bgUrls = urlMatches
                    .map((m) => m[1])
                    .filter((u) => !u.startsWith('data:image/svg'));
                if (bgUrls.length > 0) {
                    image = image || {};
                    image.backgroundImageUrls = bgUrls;
                    image.backgroundSize =
                        computedStyle.getPropertyValue('background-size') || undefined;
                }
            }

            let textContent: string | undefined;
            let inputValue: string | undefined;

            const tagName = htmlElement.tagName?.toLowerCase() || 'div';
            if (tagName === 'input' || tagName === 'textarea') {
                const val = htmlElement.value;
                if (val != null && val !== '') inputValue = String(val);
            } else {
                const tc = htmlElement.textContent?.trim();
                if (tc) textContent = tc;
            }

            const classAttr = htmlElement.getAttribute('class') || '';
            const classNameTokens = classAttr.split(/\s+/).filter(Boolean).sort().join(' ');

            const candidateIdentity = {
                tagName,
                classNameTokens,
                textSignal: textContent ? textContent.slice(0, 80) : undefined,
            };

            let classOnlyStyles: Record<string, string> | undefined;
            const styleAttr = htmlElement.getAttribute('style');
            const hasClass = classAttr.trim().length > 0;
            const hasInline = styleAttr && styleAttr.trim().length > 0;

            if (hasClass && hasInline) {
                const origStyle = htmlElement.getAttribute('style');
                htmlElement.removeAttribute('style');
                const classOnlyComputed = window.getComputedStyle(htmlElement);
                if (origStyle != null) htmlElement.setAttribute('style', origStyle);

                classOnlyStyles = {};
                for (const prop of SAFE_BASELINE_PROPS) {
                    const v = classOnlyComputed.getPropertyValue(prop);
                    if (v && v !== 'normal' && (v !== 'none' || prop === 'background-image')) {
                        classOnlyStyles[prop] = v;
                    }
                }

                const tl = classOnlyComputed.getPropertyValue('border-top-left-radius');
                const tr = classOnlyComputed.getPropertyValue('border-top-right-radius');
                const br = classOnlyComputed.getPropertyValue('border-bottom-right-radius');
                const bl = classOnlyComputed.getPropertyValue('border-bottom-left-radius');
                if (tl || tr || br || bl) {
                    if (tl === tr && tr === br && br === bl) {
                        classOnlyStyles['border-radius'] = tl;
                    } else {
                        classOnlyStyles['border-radius'] = [tl, tr, br, bl].join(' ');
                    }
                }

                if (!classOnlyStyles['background-color'] && !classOnlyStyles['background-image']) {
                    classOnlyStyles['background-color'] = 'transparent';
                    classOnlyStyles['background-image'] = 'none';
                } else if (!classOnlyStyles['background-color']) {
                    classOnlyStyles['background-color'] = 'transparent';
                } else if (!classOnlyStyles['background-image']) {
                    classOnlyStyles['background-image'] = 'none';
                }
                if (!classOnlyStyles['opacity']) classOnlyStyles['opacity'] = '1';
            }

            result.push({
                key: jaySid,
                styles,
                boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                textContent: textContent || undefined,
                inputValue: inputValue || undefined,
                image: image || undefined,
                candidateIdentity,
                classOnlyStyles: classOnlyStyles || undefined,
            });
        }

        return result;
    });

    const styleMap = new Map<string, ComputedStyleData>();
    const repeaterDataMap: RepeaterDataMap = new Map();

    for (const item of extractedData) {
        const data: ComputedStyleData = {
            styles: item.styles,
            boundingRect: item.boundingRect,
            textContent: item.textContent,
            inputValue: item.inputValue,
            image: item.image,
            candidateIdentity: item.candidateIdentity,
            classOnlyStyles: item.classOnlyStyles,
        };

        if (!styleMap.has(item.key)) {
            styleMap.set(item.key, data);
        }

        let list = repeaterDataMap.get(item.key);
        if (!list) {
            list = [];
            repeaterDataMap.set(item.key, list);
        }
        list.push(data);
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

    return { styleMap, repeaterDataMap };
}

/**
 * Parse a dataType string from editor-protocol Contract into structured info.
 * Handles: "string", "number", "boolean", "enum (val1 | val2 | ...)"
 */
export function parseDataTypeString(dataType: unknown): {
    kind: 'boolean' | 'enum' | 'string' | 'number' | 'other';
    enumValues?: string[];
} {
    if (!dataType) return { kind: 'other' };

    // Handle JayType objects (compiler stores dataType as JayType, not string)
    if (typeof dataType === 'object') {
        const jayType = dataType as { kind?: number; name?: string; values?: string[] };
        const name = jayType.name?.toLowerCase();
        if (name === 'boolean') return { kind: 'boolean' };
        if (name === 'string') return { kind: 'string' };
        if (name === 'number') return { kind: 'number' };
        // JayEnumType: kind=2 (enum), has values array
        if (jayType.values && Array.isArray(jayType.values) && jayType.values.length > 0) {
            return { kind: 'enum', enumValues: jayType.values };
        }
        return { kind: 'other' };
    }

    if (typeof dataType !== 'string') return { kind: 'other' };

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
    contractTags: ContractTag[],
    maxScenarios: number = 16,
): VariantScenario[] {
    if (contractTags.length === 0) {
        return [];
    }

    const conditionsWithAncestors: ConditionWithAncestors[] = [];
    scanForIfAttributesWithNesting(bodyDom, conditionsWithAncestors);

    const forEachInfos: ForEachInfo[] = [];
    scanForEachAttributes(bodyDom, forEachInfos);

    if (conditionsWithAncestors.length === 0 && forEachInfos.length === 0) {
        return [];
    }

    const sampleDataOverrides = generateSampleData(contractTags, forEachInfos);

    // Always include the default scenario (with sample data if available)
    const defaultQueryParts: string[] = [];
    for (const [path, jsonValue] of Object.entries(sampleDataOverrides)) {
        defaultQueryParts.push(`vs.${path}=${encodeURIComponent(jsonValue)}`);
    }
    const defaultQueryString =
        defaultQueryParts.length > 0 ? '?' + defaultQueryParts.join('&') : '';

    const scenarios: VariantScenario[] = [
        { id: 'default', contractValues: {}, queryString: defaultQueryString },
    ];

    const seenIds = new Set<string>(['default']);

    for (const { condition, ancestorConditions } of conditionsWithAncestors) {
        if (scenarios.length >= maxScenarios) break;

        // Build overrides for THIS condition
        const overrides: Record<string, string> = {};
        let allResolved = true;

        const tokens = tokenizeCondition(condition);
        for (const token of tokens) {
            const override = tokenToOverrideValue(token, contractTags);
            if (!override) {
                allResolved = false;
                continue;
            }
            overrides[override.tagPath] = override.value;
        }

        // Also activate all ancestor conditions (composite scenario)
        for (const ancestor of ancestorConditions) {
            const ancestorTokens = tokenizeCondition(ancestor);
            for (const token of ancestorTokens) {
                const override = tokenToOverrideValue(token, contractTags);
                if (!override) continue;
                if (!(override.tagPath in overrides)) {
                    overrides[override.tagPath] = override.value;
                }
            }
        }

        if (Object.keys(overrides).length === 0) continue;

        // Merge sample data for forEach paths whose ancestor conditions
        // are satisfied by this scenario's overrides
        for (const forEach of forEachInfos) {
            if (sampleDataOverrides[forEach.arrayPath]) {
                overrides[forEach.arrayPath] = sampleDataOverrides[forEach.arrayPath];
            }
        }

        const sortedEntries = Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b));
        const scenarioId = sortedEntries
            .filter(([, v]) => !v.startsWith('['))
            .map(([k, v]) => `${k}=${v}`)
            .join('&');

        if (seenIds.has(scenarioId)) continue;
        seenIds.add(scenarioId);

        const queryString =
            '?' + sortedEntries.map(([k, v]) => `vs.${k}=${encodeURIComponent(v)}`).join('&');

        const contractValues: Record<string, string | number | boolean> = {};
        for (const [k, v] of sortedEntries) {
            if (!v.startsWith('[')) contractValues[k] = v;
        }

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

    const conditionCount = conditionsWithAncestors.length;
    const scenarioCount = scenarios.length - 1;
    const sampleDataCount = Object.keys(sampleDataOverrides).length;
    console.log(
        `[ComputedStyles] ${conditionCount} if condition(s) → ${scenarioCount} scenario(s) + default` +
            (sampleDataCount > 0 ? ` (${sampleDataCount} forEach sample data injected)` : ''),
    );
    for (const s of scenarios) {
        if (s.id !== 'default') {
            console.log(`[ComputedStyles]   ${s.id}  →  ${s.queryString.substring(0, 200)}`);
        }
    }

    return scenarios;
}

interface ConditionWithAncestors {
    condition: string;
    ancestorConditions: string[];
}

interface ForEachInfo {
    arrayPath: string;
    ancestorConditions: string[];
}

/**
 * Recursively scan HTML for `if` attributes, tracking ancestor `if` nesting.
 * Each result records the ancestor chain so composite scenarios can activate
 * outer conditions alongside inner ones.
 */
function scanForIfAttributesWithNesting(
    element: HTMLElement,
    results: ConditionWithAncestors[],
    ancestorConditions: string[] = [],
): void {
    const ifAttr = element.getAttribute('if');
    const currentAncestors = ifAttr ? [...ancestorConditions, ifAttr] : ancestorConditions;

    if (ifAttr) {
        results.push({
            condition: ifAttr,
            ancestorConditions: [...ancestorConditions],
        });
    }

    if (element.childNodes) {
        for (const child of element.childNodes) {
            if ((child as any).rawTagName) {
                scanForIfAttributesWithNesting(child as HTMLElement, results, currentAncestors);
            }
        }
    }
}

/**
 * Recursively scan HTML for `forEach` attributes, recording ancestor `if`
 * conditions. Used to associate array data needs with the conditions that
 * must be active for the forEach to render.
 */
function scanForEachAttributes(
    element: HTMLElement,
    results: ForEachInfo[],
    ancestorConditions: string[] = [],
): void {
    const ifAttr = element.getAttribute('if');
    const currentAncestors = ifAttr ? [...ancestorConditions, ifAttr] : ancestorConditions;

    const forEachAttr = element.getAttribute('forEach');
    if (forEachAttr) {
        results.push({
            arrayPath: forEachAttr.trim(),
            ancestorConditions: [...currentAncestors],
        });
    }

    if (element.childNodes) {
        for (const child of element.childNodes) {
            if ((child as any).rawTagName) {
                scanForEachAttributes(child as HTMLElement, results, currentAncestors);
            }
        }
    }
}

/**
 * Generate sample data for repeated (list) contract tags.
 * Produces 2 synthetic items per list tag from the child tag schema.
 * Returns a map of tag path → JSON-encoded array string.
 */
function generateSampleData(
    contractTags: ContractTag[],
    forEachInfos: ForEachInfo[],
    itemCount: number = 2,
): Record<string, string> {
    const overrides: Record<string, string> = {};
    const forEachPaths = new Set(forEachInfos.map((f) => f.arrayPath));

    for (const arrayPath of forEachPaths) {
        const pathParts = arrayPath.split('.');
        const tag = findEditorProtocolTag(pathParts, contractTags);

        if (tag?.repeated && tag.tags && tag.tags.length > 0) {
            const items = Array.from({ length: itemCount }, (_, i) =>
                generateItemFromTags(tag.tags!, i),
            );
            overrides[arrayPath] = JSON.stringify(items);
        } else if (tag?.repeated) {
            overrides[arrayPath] = JSON.stringify(
                Array.from({ length: itemCount }, (_, i) => ({ id: `sample-${i + 1}` })),
            );
        }
    }

    return overrides;
}

function generateItemFromTags(childTags: ContractTag[], index: number): Record<string, unknown> {
    const item: Record<string, unknown> = {};
    for (const child of childTags) {
        const dataType = parseDataTypeString(child.dataType);
        if (dataType.kind === 'boolean') {
            item[child.tag] = index % 2 === 0;
        } else if (dataType.kind === 'number') {
            item[child.tag] = (index + 1) * 10;
        } else if (dataType.kind === 'enum' && dataType.enumValues?.length) {
            item[child.tag] = dataType.enumValues[index % dataType.enumValues.length];
        } else {
            item[child.tag] = `${child.tag} ${index + 1}`;
        }
    }
    return item;
}
