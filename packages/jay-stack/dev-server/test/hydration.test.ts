/**
 * Hydration tests — DL#104
 *
 * Validates SSR rendering and hydration using Playwright + fixture comparison.
 *
 * Layer 1: HTTP fetch SSR HTML → toEqual against expected-ssr.html fixture
 * Layer 2: Playwright navigates to page → waits for jay:automation-ready → validates DOM
 */

import { mkDevServer, type DevServer } from '../lib';
import { JayRollupConfig } from '@jay-framework/vite-plugin';
import path from 'path';
import fs from 'fs';
import { prettify } from '@jay-framework/compiler-shared';
import jsBeautify from 'js-beautify';
import { chromium, type Browser, type Page } from 'playwright';

// @vitest-environment node

/** Normalize HTML for stable comparison — one element per line */
function normalizeHtml(html: string): string {
    return jsBeautify.html(
        html
            .split('\n')
            .map((l) => l.trim())
            .join(''),
        { indent_size: 2, inline: [] },
    );
}

/** Extract the inner HTML of <div id="target">...</div> */
function extractTargetContent(html: string): string {
    const match = html.match(/<div id="target">([\s\S]*?)<\/div>\s*\n?\s*<script/);
    if (match) return match[1];
    const match2 = html.match(/<div id="target">([\s\S]*?)<\/div>/);
    return match2 ? match2[1] : '';
}

/** Re-throw an error with the #target innerHTML appended for debugging. */
async function dumpTargetContent(page: Page, error: unknown): Promise<never> {
    let targetHTML: string;
    try {
        targetHTML = await page.evaluate(
            () => document.getElementById('target')?.innerHTML ?? '(no #target)',
        );
    } catch {
        targetHTML = '(could not read page)';
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`${msg}\n\n#target innerHTML:\n${targetHTML}`);
}

/**
 * Wait for hydration to complete (automation API available).
 * Collects page errors and throws with diagnostics if hydration doesn't complete.
 * Uses a hard JS timeout to handle Vite reload loops where Playwright's
 * waitForFunction restarts on each navigation and never fires its own timeout.
 */
async function waitForHydration(page: Page) {
    const errors: string[] = [];
    const handler = (err: Error) => errors.push(err.message);
    page.on('pageerror', handler);

    let hardTimer: ReturnType<typeof setTimeout>;
    try {
        await Promise.race([
            page.waitForFunction(() => Boolean((window as any).__jay?.automation), {
                timeout: 5000,
            }),
            new Promise<never>((_, reject) => {
                hardTimer = setTimeout(
                    () => reject(new Error('waitForHydration hard timeout')),
                    6000,
                );
            }),
        ]);
    } catch (e) {
        const errorInfo = errors.length ? `\nPage errors:\n  ${errors.join('\n  ')}` : '';
        const playwrightError = e instanceof Error ? e.message : String(e);
        throw new Error(
            `Hydration did not complete within 5s.${errorInfo}\nPlaywright: ${playwrightError}`,
        );
    } finally {
        clearTimeout(hardTimer!);
        page.off('pageerror', handler);
    }
}

/** Strip `// @ts-ignore` lines (used in fixtures to suppress import errors) */
function stripTsDirectives(code: string): string {
    return code.replace(/\/\/ @ts-ignore\n/g, '');
}

/** Strip .ts extensions from import paths (Vite resolves to .ts in dev mode) */
function stripTsExtensionsFromImports(code: string): string {
    return code.replace(/(from\s+['"])(.+?)\.ts(['"])/g, '$1$2$3');
}

/** Monorepo root — used to canonicalize absolute paths in generated code */
const MONOREPO_ROOT = path.resolve(__dirname, '../../../..');
const MONOREPO_ROOT_REGEX = new RegExp(MONOREPO_ROOT.replace(/[/\\]/g, '[/\\\\]'), 'g');

/** Replace monorepo-absolute paths with a canonical placeholder */
function canonicalizePaths(code: string): string {
    return code.replace(MONOREPO_ROOT_REGEX, '{{ROOT}}');
}

/** Read expected fixture file */
function readFixture(dirName: string, fileName: string): string {
    return canonicalizePaths(
        stripTsDirectives(fs.readFileSync(path.join(__dirname, dirName, fileName), 'utf-8')),
    );
}

// ============================================================================
// Test suite — one dev server per fixture directory
// ============================================================================

/**
 * Run tests for a single fixture page.
 * Starts its own dev server and Playwright browser.
 */
interface TestFixtureOpts {
    expectedViewState?: object;
    ssrChecks?: (targetHtml: string) => void;
    hydrationChecks?: (page: Page) => Promise<void>;
    interactivityChecks?: (page: Page) => Promise<void>;
    /** Disable SSR — serves client-only pages (element target, no hydration).
     *  When true, only the SSR-disabled mode is tested. */
    disableSSR?: boolean;
}

/**
 * Run tests for a fixture in all 3 modes:
 *   1. SSR disabled (client-only, element target)
 *   2. SSR enabled, first request (slow render runs fresh)
 *   3. SSR enabled, cached request (slow render served from cache)
 *
 * When disableSSR is explicitly true, only mode 1 runs.
 */
function testFixture(dirName: string, opts: TestFixtureOpts = {}) {
    if (opts.disableSSR) {
        testFixtureMode(dirName, { ...opts, disableSSR: true });
    } else {
        describe('SSR disabled', () => {
            testFixtureMode(dirName, { ...opts, disableSSR: true });
        });
        describe('SSR first request', () => {
            testFixtureMode(dirName, opts);
        });
        describe('SSR cached request', () => {
            testFixtureMode(dirName, { ...opts, warmCache: true });
        });
    }
}

/**
 * Internal: run tests for a single fixture page in a single mode.
 * Starts its own dev server and Playwright browser.
 */
function testFixtureMode(dirName: string, opts: TestFixtureOpts & { warmCache?: boolean } = {}) {
    let devServer: DevServer;
    let devServerUrl: string;
    let browser: Browser;

    beforeAll(async () => {
        const dirPath = path.resolve(__dirname, dirName);
        devServer = await mkDevServer({
            pagesRootFolder: dirPath,
            projectRootFolder: dirPath,
            jayRollupConfig: {
                tsConfigFilePath: path.join(dirPath, 'tsconfig.json'),
            } as JayRollupConfig,
            disableSSR: opts.disableSSR,
        });

        // Create Express app with routes + Vite middleware
        const express = await import('express');
        const app = express.default();

        // Mount page routes first (SSR handlers)
        for (const route of devServer.routes) {
            app.get(route.path, route.handler);
        }

        // Then Vite middleware (serves client scripts, HMR, etc.)
        app.use(devServer.viteServer.middlewares);

        // Start HTTP server on random port
        const httpServer = app.listen(0);
        await new Promise<void>((resolve) => httpServer.on('listening', resolve));
        const addr = httpServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 3000;
        devServerUrl = `http://localhost:${port}`;

        // Store for cleanup
        (devServer as any)._httpServer = httpServer;

        browser = await chromium.launch();

        // Prime the slow render cache so test requests hit the cached path
        if (opts.warmCache) {
            await fetch(`${devServerUrl}/`);
        }
    }, 30000);

    afterAll(async () => {
        await browser?.close();
        await new Promise<void>((resolve) => {
            (devServer as any)?._httpServer?.close(() => resolve());
        }).catch(() => {});
        await devServer?.viteServer?.close();

        // Clean up build directories created during the test
        const buildDir = path.join(__dirname, dirName, 'build');
        fs.rmSync(buildDir, { recursive: true, force: true });
    });

    const ssrFixtureName = `expected-ssr.html`;
    const hydrateFixtureName = `expected-hydrate.ts`;

    const ssrFixturePath = path.join(__dirname, dirName, ssrFixtureName);
    if (
        !opts.disableSSR &&
        (fs.existsSync(ssrFixturePath) || process.env.UPDATE_FIXTURES === '1')
    ) {
        it('SSR output matches fixture', async () => {
            const response = await fetch(`${devServerUrl}/`);
            const html = await response.text();
            const ssrContent = normalizeHtml(extractTargetContent(html));
            if (process.env.UPDATE_FIXTURES === '1') {
                fs.writeFileSync(ssrFixturePath, ssrContent);
            }
            const expected = normalizeHtml(readFixture(dirName, ssrFixtureName));
            expect(ssrContent).toEqual(expected);
        });
    }

    const hydrateFixturePath = path.join(__dirname, dirName, hydrateFixtureName);
    if (
        !opts.disableSSR &&
        (fs.existsSync(hydrateFixturePath) || process.env.UPDATE_FIXTURES === '1')
    ) {
        it('hydrate script matches fixture', async () => {
            const dirPath = path.resolve(__dirname, dirName);
            // Use pre-rendered path if available (slow-rendered pages have
            // slow bindings resolved — hydrate script should not adopt them)
            const preRenderedPath = path.join(dirPath, 'build/pre-rendered/page.jay-html');
            const hydrateSourcePath = fs.existsSync(preRenderedPath)
                ? preRenderedPath
                : path.resolve(dirPath, 'page.jay-html');

            let transformResult = await devServer.viteServer
                .transformRequest(hydrateSourcePath + '?jay-hydrate')
                .catch(() => null);
            if (!transformResult?.code) {
                transformResult = await devServer.viteServer.transformRequest(
                    hydrateSourcePath + '?import&jay-hydrate.ts',
                );
            }
            expect(transformResult?.code).toBeTruthy();

            let actual = canonicalizePaths(
                transformResult!.code
                    .replace(new RegExp(dirPath.replace(/[/\\]/g, '[/\\\\]'), 'g'), '.')
                    .replace(/\/\/# sourceMappingURL=.*/, ''),
            );
            actual = await prettify(actual);
            actual = stripTsExtensionsFromImports(actual);

            if (process.env.UPDATE_FIXTURES === '1') {
                const lines = actual.split('\n');
                const result: string[] = [];
                for (const line of lines) {
                    if (
                        line.startsWith("} from '") ||
                        (line.startsWith('import ') && line.includes(" from '"))
                    )
                        result.push('// @ts-ignore');
                    result.push(line);
                }
                fs.writeFileSync(hydrateFixturePath, result.join('\n'));
            }
            const expected = await prettify(readFixture(dirName, hydrateFixtureName));
            expect(actual).toEqual(expected);
        });
    }

    it('page loads without errors', async () => {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        try {
            await page.goto(`${devServerUrl}/`, { waitUntil: 'load' });
            expect(errors).toEqual([]);
        } finally {
            await page.close();
        }
    });

    if (opts.ssrChecks) {
        it('SSR content has expected structure', async () => {
            const response = await fetch(`${devServerUrl}/`);
            const html = await response.text();
            const targetHtml = extractTargetContent(html);
            opts.ssrChecks!(targetHtml);
        });
    }

    if (opts.expectedViewState) {
        it('automation API returns expected viewState', async () => {
            const page = await browser.newPage();
            try {
                await page.goto(`${devServerUrl}/`, { waitUntil: 'load' });
                const pageState = await page.evaluate(() => {
                    return (window as any).__jay?.automation?.getPageState();
                });
                expect(pageState).toBeDefined();
                expect(pageState.viewState).toEqual(opts.expectedViewState);
            } finally {
                await page.close();
            }
        });
    }

    if (opts.hydrationChecks) {
        it('DOM is correct after hydration', async () => {
            const page = await browser.newPage();
            try {
                await page.goto(`${devServerUrl}/`, { waitUntil: 'load' });
                await waitForHydration(page);
                page.setDefaultTimeout(2000);
                await opts.hydrationChecks!(page);
            } catch (e) {
                await dumpTargetContent(page, e);
            } finally {
                await page.close();
            }
        }, 15000);
    }

    if (opts.interactivityChecks) {
        it('interactivity works after hydration', async () => {
            const page = await browser.newPage();
            try {
                await page.goto(`${devServerUrl}/`, { waitUntil: 'load' });
                await waitForHydration(page);
                page.setDefaultTimeout(2000);
                await opts.interactivityChecks!(page);
            } catch (e) {
                await dumpTargetContent(page, e);
            } finally {
                await page.close();
            }
        }, 15000);
    }
}

// ============================================================================
// Tests
// ============================================================================

describe('hydration', () => {
    describe('1. Static elements', () => {
        testFixture('1-page-static-only', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Static Page');
                expect(await page.textContent('#target p')).toEqual('No dynamic content here');
                const items = await page.$$('#target li');
                expect(items).toHaveLength(2);
            },
        });
    });

    describe('2a. Phase-aware Dynamic text', () => {
        testFixture('2a-page-dynamic-text', {
            expectedViewState: {
                title: 'Hello Dynamic',
                fastCount: 10,
                interactiveCount: 20,
            },
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Hello Dynamic');
                expect(await page.textContent('#target p')).toEqual('Fast Count: 10');
                expect(await page.textContent('#target p >> nth=1')).toEqual(
                    'Interactive Count: 20',
                );
                expect(await page.textContent('#target span')).toEqual('Static text stays');
            },
        });
    });

    describe('2b. Dynamic text without contract', () => {
        testFixture('2b-page-dynamic-text-no-contract', {
            expectedViewState: { title: 'Hello Dynamic', count: 42 },
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Hello Dynamic');
                expect(await page.textContent('#target p')).toEqual('Count: 42');
                expect(await page.textContent('#target span')).toEqual('Static text stays');
            },
        });
    });

    describe('3a. Phase-aware conditionals', () => {
        testFixture('3a-page-conditional-phases', {
            expectedViewState: {
                title: 'Phase Conditionals',
                slowVisible: true,
                slowHidden: false,
                fastVisible: true,
                fastHidden: false,
                interactiveVisible: true,
                interactiveHidden: false,
            },
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Phase Conditionals');
                // Slow conditionals: resolved at build time, baked into HTML
                expect(await page.$('#target .slow-true')).toBeTruthy();
                expect(await page.$('#target .slow-false')).toBeNull();
                // Fast conditionals: resolved at SSR, static on client
                expect(await page.$('#target .fast-true')).toBeTruthy();
                expect(await page.$('#target .fast-false')).toBeNull();
                // Interactive conditionals: resolved at SSR, reactive on client
                expect(await page.$('#target .interactive-true')).toBeTruthy();
                expect(await page.$('#target .interactive-hidden')).toBeNull();
                // Mixed: slow(true) && fast(true) && interactive(true) → visible
                expect(await page.$('#target .mixed')).toBeTruthy();
            },
            interactivityChecks: async (page) => {
                // Before toggle: interactiveVisible=true, interactiveHidden=false, mixed=visible
                expect(await page.$('#target .interactive-true')).toBeTruthy();
                expect(await page.$('#target .interactive-hidden')).toBeNull();
                expect(await page.$('#target .mixed')).toBeTruthy();

                // Toggle: interactiveVisible→false, interactiveHidden→true
                await page.click('#target button');
                await page.waitForFunction(
                    () => document.querySelector('#target .interactive-hidden') !== null,
                    { timeout: 2000 },
                );
                expect(await page.$('#target .interactive-true')).toBeNull();
                expect(await page.$('#target .interactive-hidden')).toBeTruthy();
                // Mixed should also hide (interactiveVisible is now false)
                expect(await page.$('#target .mixed')).toBeNull();

                // Slow and fast conditionals should be unchanged (static)
                expect(await page.$('#target .slow-true')).toBeTruthy();
                expect(await page.$('#target .slow-false')).toBeNull();
                expect(await page.$('#target .fast-true')).toBeTruthy();
                expect(await page.$('#target .fast-false')).toBeNull();

                // Toggle back: interactiveVisible→true, interactiveHidden→false
                await page.click('#target button');
                await page.waitForFunction(
                    () => document.querySelector('#target .interactive-true') !== null,
                    { timeout: 2000 },
                );

                // Verify ordering: button must remain AFTER all conditionals
                const order = await page.evaluate(() => {
                    const children = document.querySelector('#target > div')!.children;
                    return Array.from(children).map(
                        (el) => el.className || el.tagName.toLowerCase(),
                    );
                });
                // Button should be last element
                expect(order[order.length - 1]).toBe('button');
            },
        });
    });

    describe('3b. Conditionals without contract', () => {
        testFixture('3b-page-conditional', {
            expectedViewState: { isActive: true, message: 'Conditional Test' },
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Conditional Test');
                // isActive=true → "Active" span should be visible
                const activeSpan = await page.$('#target span:text("Active")');
                expect(activeSpan).toBeTruthy();
            },
        });
    });

    describe('4a. Phase-aware forEach', () => {
        testFixture('4a-page-foreach-phases', {
            expectedViewState: {
                title: 'Phase ForEach Test',
                slowItems: [
                    { _id: 's1', label: 'Slow A' },
                    { _id: 's2', label: 'Slow B' },
                ],
                fastItems: [
                    { _id: 'f1', label: 'Fast A' },
                    { _id: 'f2', label: 'Fast B' },
                ],
                fastMixedItems: [
                    { _id: 'm1', label: 'Mixed A', count: 10 },
                    { _id: 'm2', label: 'Mixed B', count: 20 },
                ],
                interactiveItems: [
                    { _id: 'i1', label: 'Interactive A', count: 100 },
                    { _id: 'i2', label: 'Interactive B', count: 200 },
                ],
            },
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Phase ForEach Test');
                // Slow list: baked at build time, static
                const slowItems = await page.$$('#target .slow li');
                expect(slowItems).toHaveLength(2);
                expect(await slowItems[0].textContent()).toEqual('Slow A');
                expect(await slowItems[1].textContent()).toEqual('Slow B');
                // Fast list: rendered at SSR, purely static on client (no interactive children)
                const fastItems = await page.$$('#target .fast li');
                expect(fastItems).toHaveLength(2);
                expect(await fastItems[0].textContent()).toEqual('Fast A');
                expect(await fastItems[1].textContent()).toEqual('Fast B');
                // Fast mixed list: fast forEach with interactive children
                // - label is fast-only (static on client)
                // - count is fast+interactive (reactive on client)
                // - increment button is interactive ref
                const mixedItems = await page.$$('#target .fast-mixed .item');
                expect(mixedItems).toHaveLength(2);
                expect(
                    await page.textContent('#target .fast-mixed .item:nth-child(2) .label'),
                ).toEqual('Mixed A');
                expect(
                    await page.textContent('#target .fast-mixed .item:nth-child(2) .count'),
                ).toEqual('10');
                expect(
                    await page.textContent('#target .fast-mixed .item:nth-child(3) .label'),
                ).toEqual('Mixed B');
                expect(
                    await page.textContent('#target .fast-mixed .item:nth-child(3) .count'),
                ).toEqual('20');
                // Interactive list: rendered at SSR, reactive on client
                // - label, count, increment button all interactive
                const interactiveItems = await page.$$('#target .interactive .item');
                expect(interactiveItems).toHaveLength(2);
                expect(
                    await page.textContent('#target .interactive .item:nth-child(2) .label'),
                ).toEqual('Interactive A');
                expect(
                    await page.textContent('#target .interactive .item:nth-child(2) .count'),
                ).toEqual('100');
                expect(
                    await page.textContent('#target .interactive .item:nth-child(3) .label'),
                ).toEqual('Interactive B');
                expect(
                    await page.textContent('#target .interactive .item:nth-child(3) .count'),
                ).toEqual('200');
            },
            interactivityChecks: async (page) => {
                // --- Per-item increment: fast-mixed forEach ---
                // Click +1 on first fast-mixed item (count: 10 → 11)
                await page.click('#target .fast-mixed .item:nth-child(2) button');
                await page.waitForFunction(
                    () =>
                        document.querySelector('#target .fast-mixed .item:nth-child(2) .count')
                            ?.textContent === '11',
                    { timeout: 2000 },
                );
                expect(
                    await page.textContent('#target .fast-mixed .item:nth-child(2) .count'),
                ).toEqual('11');
                // Second fast-mixed item unchanged
                expect(
                    await page.textContent('#target .fast-mixed .item:nth-child(3) .count'),
                ).toEqual('20');
                // Labels unchanged (fast-only, static on client)
                expect(
                    await page.textContent('#target .fast-mixed .item:nth-child(2) .label'),
                ).toEqual('Mixed A');

                // --- Per-item increment: interactive forEach ---
                // Click +1 on second interactive item (count: 200 → 201)
                await page.click('#target .interactive .item:nth-child(3) button:text("+1")');
                await page.waitForFunction(
                    () =>
                        document.querySelector('#target .interactive .item:nth-child(3) .count')
                            ?.textContent === '201',
                    { timeout: 2000 },
                );
                expect(
                    await page.textContent('#target .interactive .item:nth-child(3) .count'),
                ).toEqual('201');
                // First interactive item unchanged
                expect(
                    await page.textContent('#target .interactive .item:nth-child(2) .count'),
                ).toEqual('100');

                // --- Add/remove interactive items ---
                await page.click('#target .interactive button:text("Add")');
                await page.waitForFunction(
                    () => document.querySelectorAll('#target .interactive .item').length === 3,
                    { timeout: 2000 },
                );
                expect(
                    await page.textContent('#target .interactive .item:nth-child(4) .label'),
                ).toEqual('Interactive C');
                expect(
                    await page.textContent('#target .interactive .item:nth-child(4) .count'),
                ).toEqual('300');

                // Remove last item
                await page.click('#target .interactive button:text("Remove")');
                await page.waitForFunction(
                    () => document.querySelectorAll('#target .interactive .item').length === 2,
                    { timeout: 2000 },
                );
                // Previous increment on second item should be preserved
                expect(
                    await page.textContent('#target .interactive .item:nth-child(3) .count'),
                ).toEqual('201');

                // --- Static lists unchanged ---
                const slowItems = await page.$$('#target .slow li');
                expect(slowItems).toHaveLength(2);
                expect(await slowItems[0].textContent()).toEqual('Slow A');
                const fastItems = await page.$$('#target .fast li');
                expect(fastItems).toHaveLength(2);
                expect(await fastItems[0].textContent()).toEqual('Fast A');
            },
        });
    });

    describe('4b. forEach without contract', () => {
        testFixture('4b-page-foreach', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('ForEach Test');
                const items = await page.$$('#target li');
                expect(items).toHaveLength(3);
                expect(await items[0].textContent()).toEqual('Alpha');
                expect(await items[1].textContent()).toEqual('Beta');
                expect(await items[2].textContent()).toEqual('Gamma');
            },
        });
    });

    // Test 5 (slowForEach without contract) removed — covered by 4a's slow forEach with contract.
    // Without a contract, slow render resolves nothing (DL#108), so slowForEach doesn't unroll.

    describe('5a. Headless — static placement', () => {
        testFixture('5a-page-headless-static', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Headless Test');
                expect(await page.textContent('#target .label')).toEqual('Item 1');
                expect(await page.textContent('#target .value')).toEqual('10');
            },
            interactivityChecks: async (page) => {
                // Initial value
                expect(await page.textContent('#target .value')).toEqual('10');
                // Click increment button
                await page.click('#target button');
                // Value should increase
                await page.waitForFunction(
                    () => {
                        return document.querySelector('#target .value')?.textContent === '11';
                    },
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target .value')).toEqual('11');
            },
        });
    });

    describe('5b. Headless — under condition', () => {
        testFixture('5b-page-headless-conditional', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Conditional Headless');
                // showWidget=true initially → widget visible
                expect(await page.textContent('#target .label')).toEqual('Item 1');
                expect(await page.textContent('#target .value')).toEqual('10');
                // "Widget hidden" text should NOT be visible
                expect(await page.$('#target p')).toBeNull();
            },
            interactivityChecks: async (page) => {
                // Widget increment button works
                expect(await page.textContent('#target .value')).toEqual('10');
                await page.click('#target .widget button');
                await page.waitForFunction(
                    () => {
                        return document.querySelector('#target .value')?.textContent === '11';
                    },
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target .value')).toEqual('11');

                // Toggle: hide widget
                await page.click('button:text("Toggle")');
                await page.waitForFunction(
                    () => {
                        return document.querySelector('#target p')?.textContent === 'Widget hidden';
                    },
                    { timeout: 2000 },
                );
                expect(await page.$('#target .widget')).toBeNull();
                expect(await page.textContent('#target p')).toEqual('Widget hidden');

                // Toggle: show widget again
                await page.click('button:text("Toggle")');
                await page.waitForFunction(
                    () => {
                        return document.querySelector('#target .widget') !== null;
                    },
                    { timeout: 2000 },
                );
                expect(await page.$('#target .widget')).toBeTruthy();
            },
        });
    });

    describe('5c. Headless — under forEach (nested in wrapper div)', () => {
        // forEach widget is fast-only (no slow phase) — no need for slow render cache.
        // Widget is inside <div class="card"><strong>{name}</strong><jay:widget>...
        // This tests coordinate resolution when headless instance has intermediate
        // wrapper elements between the forEach item root and the jay:xxx tag.
        testFixture('5c-page-headless-foreach', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('ForEach Headless');
                // Each card has a <strong> with the item name and a .widget div
                const cards = await page.$$('#target .card');
                expect(cards).toHaveLength(3);
                expect(await cards[0].textContent()).toContain('Item 1');
                expect(await cards[1].textContent()).toContain('Item 2');
                expect(await cards[2].textContent()).toContain('Item 3');
                // Widget values from fast phase
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(3);
                expect(await widgets[0].textContent()).toContain('10');
                expect(await widgets[1].textContent()).toContain('20');
                expect(await widgets[2].textContent()).toContain('30');
            },
            interactivityChecks: async (page) => {
                // Click the second widget's increment button
                const buttons = await page.$$('#target .widget button');
                expect(buttons).toHaveLength(3);
                await buttons[1].click();
                // Second widget's value should change from 20 to 21
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[1]?.textContent === '21';
                    },
                    { timeout: 2000 },
                );
                let values = await page.$$('#target .widget .value');
                expect(await values[0].textContent()).toEqual('10'); // unchanged
                expect(await values[1].textContent()).toEqual('21'); // incremented
                expect(await values[2].textContent()).toEqual('30'); // unchanged

                // Add a new item
                await page.click('button:text("Add Item")');
                await page.waitForFunction(
                    () => {
                        return document.querySelectorAll('#target .widget').length === 4;
                    },
                    { timeout: 2000 },
                );
                let widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(4);
                // New item should have label "Item 4" and value 40
                expect(await widgets[3].textContent()).toContain('Item 4');
                expect(await widgets[3].textContent()).toContain('40');

                // Remove last item
                await page.click('button:text("Remove Last")');
                await page.waitForFunction(
                    () => {
                        return document.querySelectorAll('#target .widget').length === 3;
                    },
                    { timeout: 2000 },
                );
                widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(3);

                // Previous items should still have their state
                values = await page.$$('#target .widget .value');
                expect(await values[1].textContent()).toEqual('21'); // still incremented
            },
        });
    });

    describe('5d. Headless — under slowForEach', () => {
        testFixture('5d-page-headless-slow-foreach', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('SlowForEach Headless');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(2);
                expect(await widgets[0].textContent()).toContain('Item 1');
                expect(await widgets[0].textContent()).toContain('10');
                expect(await widgets[1].textContent()).toContain('Item 2');
                expect(await widgets[1].textContent()).toContain('20');
            },
            interactivityChecks: async (page) => {
                const widgets = await page.$$('#target .widget');
                expect(await widgets[0].textContent()).toContain('10');
                await page.click('#target .widget button');
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[0]?.textContent === '11';
                    },
                    { timeout: 2000 },
                );
                const updatedWidgets = await page.$$('#target .widget');
                expect(await updatedWidgets[0].textContent()).toContain('11');
            },
        });
    });

    describe('5d2. Headless — under slowForEach with wrapper div', () => {
        // Same as 5d but <jay:widget> is wrapped in <div class="card">,
        // matching the fake-shop pattern where a wrapper element sits between
        // the forEach item boundary and the headless instance.
        testFixture('5d2-page-headless-slow-foreach-wrapped', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('SlowForEach Headless');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(2);
                expect(await widgets[0].textContent()).toContain('Item 1');
                expect(await widgets[0].textContent()).toContain('10');
                expect(await widgets[1].textContent()).toContain('Item 2');
                expect(await widgets[1].textContent()).toContain('20');
            },
            interactivityChecks: async (page) => {
                const widgets = await page.$$('#target .widget');
                expect(await widgets[0].textContent()).toContain('10');
                await page.click('#target .widget button');
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[0]?.textContent === '11';
                    },
                    { timeout: 2000 },
                );
                const updatedWidgets = await page.$$('#target .widget');
                expect(await updatedWidgets[0].textContent()).toContain('11');
            },
        });
    });

    describe('5e. Headless — under forEach with wrapper + preceding sections', () => {
        // Reproduces fake-shop pattern: multiple sections before the forEach,
        // headless instance inside <div class="card"><strong>{name}</strong><jay:widget>.
        // Tests that coordinates are correct when forEach is not the first child.
        // Also verifies forEach carry forward reaches the interactive constructor.
        testFixture('5e-page-headless-foreach-nested', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Nested ForEach Test');
                // Static section should be present
                expect(await page.textContent('#target .section h2')).toEqual('Static Section');
                // Widgets inside forEach cards
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(2);
                expect(await widgets[0].textContent()).toContain('10');
                expect(await widgets[1].textContent()).toContain('20');
                // Item names in <strong> tags
                const names = await page.$$('#target .card strong');
                expect(names).toHaveLength(2);
                expect(await names[0].textContent()).toEqual('Alpha');
                expect(await names[1].textContent()).toEqual('Beta');
            },
            interactivityChecks: async (page) => {
                // Click the first widget's increment button (itemId="1" → step=1)
                const buttons = await page.$$('#target .widget button');
                expect(buttons).toHaveLength(2);
                await buttons[0].click();
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[0]?.textContent === '11';
                    },
                    { timeout: 2000 },
                );
                let values = await page.$$('#target .widget .value');
                expect(await values[0].textContent()).toEqual('11'); // 10 + step 1
                expect(await values[1].textContent()).toEqual('20'); // unchanged

                // Click the second widget's increment button (itemId="2" → step=2)
                // This verifies carry forward reaches the correct instance:
                // if carry forward is missing, step defaults to 1 and value becomes 21.
                // With correct carry forward (itemId="2"), step=2 and value becomes 22.
                await buttons[1].click();
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[1]?.textContent === '22';
                    },
                    { timeout: 2000 },
                );
                values = await page.$$('#target .widget .value');
                expect(await values[1].textContent()).toEqual('22'); // 20 + step 2
            },
        });
    });

    describe('5f. Headless — two static instances with different props', () => {
        // Two <jay:widget> instances in different parent scopes with different props.
        // Both must get their own fast ViewState and carryForward —
        // the __headlessInstances key must be unique per instance.
        testFixture('5f-page-headless-two-instances', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Two Instances Test');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(2);
                // First widget: itemId="1" → label "Item 1", value 10
                expect(await widgets[0].textContent()).toContain('Item 1');
                expect(await widgets[0].textContent()).toContain('10');
                // Second widget: itemId="3" → label "Item 3", value 30
                expect(await widgets[1].textContent()).toContain('Item 3');
                expect(await widgets[1].textContent()).toContain('30');
            },
            interactivityChecks: async (page) => {
                // Click the second widget's increment button
                const buttons = await page.$$('#target .widget button');
                expect(buttons).toHaveLength(2);
                await buttons[1].click();
                // Second widget's value should change from 30 to 31
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[1]?.textContent === '31';
                    },
                    { timeout: 2000 },
                );
                const values = await page.$$('#target .widget .value');
                expect(await values[0].textContent()).toEqual('10'); // first unchanged
                expect(await values[1].textContent()).toEqual('31'); // second incremented
            },
        });
    });

    describe('6a. Key-based headless component', () => {
        // Page uses key-based headless inclusion (key="headless" on the script tag)
        // instead of instance-based <jay:xxx> pattern.
        // Headless component has slow (label), fast+interactive (count), and interactive ref (increment).
        testFixture('6a-page-with-keyed-headless', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Keyed Headless Test');
                // label from slow phase, count from fast phase
                expect(await page.textContent('#target .label')).toEqual('Keyed Headless');
                expect(await page.textContent('#target .count')).toEqual('10');
            },
            interactivityChecks: async (page) => {
                // Click +1 button → count should increment
                expect(await page.textContent('#target .count')).toEqual('10');
                await page.click('#target .widget button');
                await page.waitForFunction(
                    () => document.querySelector('#target .count')?.textContent === '11',
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target .count')).toEqual('11');
                // label should stay the same (slow, static)
                expect(await page.textContent('#target .label')).toEqual('Keyed Headless');
            },
        });
    });

    describe('7. Fast-only page with headless instance (no slow phase)', () => {
        // Page has withFastRender + withInteractive but NO withSlowlyRender.
        // Tests that the unified pipeline discovers and renders headless instances
        // without a slow phase (DL#109).
        testFixture('7-page-fast-only', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Fast Only Page');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(1);
                expect(await widgets[0].textContent()).toContain('10');
            },
            interactivityChecks: async (page) => {
                const buttons = await page.$$('#target .widget button');
                expect(buttons).toHaveLength(1);
                await buttons[0].click();
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[0]?.textContent === '11';
                    },
                    { timeout: 2000 },
                );
                const values = await page.$$('#target .widget .value');
                expect(await values[0].textContent()).toEqual('11');
            },
        });
    });
});
