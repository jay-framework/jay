/**
 * Hydration tests — DL#104
 *
 * Validates SSR rendering and hydration using Playwright + fixture comparison.
 *
 * Layer 1: HTTP fetch SSR HTML → toEqual against expected-ssr.html fixture
 * Layer 2: Playwright navigates to page → waits for jay:automation-ready → validates DOM
 */

import { mkDevServer, type DevServer } from '../lib';
import { clearServerElementCache } from '@jay-framework/stack-server-runtime';
import { JayRollupConfig } from '@jay-framework/vite-plugin';
import path from 'path';
import fs from 'fs';
import http from 'node:http';
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
    /** Subdirectory within the fixture that contains the pages (sets pagesRootFolder). */
    pagesSubdir?: string;
    /** URL route path to test (default: '/'). */
    routePath?: string;
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
    const routePath = opts.routePath ?? '/';

    beforeAll(async () => {
        const dirPath = path.resolve(__dirname, dirName);
        const pagesRoot = opts.pagesSubdir ? path.join(dirPath, opts.pagesSubdir) : dirPath;

        // Create Express app and HTTP server first so Vite's HMR WebSocket
        // piggybacks on this server's port instead of the default 24678
        const express = await import('express');
        const app = express.default();
        const httpServer = http.createServer(app);

        devServer = await mkDevServer({
            pagesRootFolder: pagesRoot,
            projectRootFolder: dirPath,
            jayRollupConfig: {
                tsConfigFilePath: path.join(dirPath, 'tsconfig.json'),
            } as JayRollupConfig,
            disableSSR: opts.disableSSR,
            httpServer,
        });

        // Mount page routes first (SSR handlers)
        for (const route of devServer.routes) {
            app.get(route.path, route.handler);
        }

        // Then Vite middleware (serves client scripts, HMR, etc.)
        app.use(devServer.viteServer.middlewares);

        // Start HTTP server on random port
        httpServer.listen(0);
        await new Promise<void>((resolve) => httpServer.on('listening', resolve));
        const addr = httpServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 3000;
        devServerUrl = `http://localhost:${port}`;

        // Store for cleanup
        (devServer as any)._httpServer = httpServer;

        browser = await chromium.launch();

        // Prime the slow render cache so test requests hit the cached path
        if (opts.warmCache) {
            await fetch(`${devServerUrl}${routePath}`);
        }
    }, 30000);

    afterAll(async () => {
        await browser?.close();
        await new Promise<void>((resolve) => {
            (devServer as any)?._httpServer?.close(() => resolve());
        }).catch(() => {});
        await devServer?.viteServer?.close();

        // Clean up build directories and server element cache.
        // The cache is module-level — without clearing it, subsequent test modes
        // would reuse stale entries pointing to deleted CSS files.
        clearServerElementCache();
        const dirPath = path.resolve(__dirname, dirName);
        const pagesRoot = opts.pagesSubdir ? path.join(dirPath, opts.pagesSubdir) : dirPath;
        // Clean build dirs in both project root and page directory
        fs.rmSync(path.join(dirPath, 'build'), { recursive: true, force: true });
        if (opts.pagesSubdir) {
            // Also clean build dirs created under the pages tree
            const routeSubPath = routePath === '/' ? '' : routePath.replace(/^\//, '');
            const pageDir = routeSubPath ? path.join(pagesRoot, routeSubPath) : pagesRoot;
            fs.rmSync(path.join(pageDir, 'build'), { recursive: true, force: true });
        }
    });

    const ssrFixtureName = `expected-ssr.html`;
    const hydrateFixtureName = `expected-hydrate.ts`;

    const ssrFixturePath = path.join(__dirname, dirName, ssrFixtureName);
    if (
        !opts.disableSSR &&
        (fs.existsSync(ssrFixturePath) || process.env.UPDATE_FIXTURES === '1')
    ) {
        it('SSR output matches fixture', async () => {
            const response = await fetch(`${devServerUrl}${routePath}`);
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
            const pagesRoot = opts.pagesSubdir ? path.join(dirPath, opts.pagesSubdir) : dirPath;
            const routeSubPath = routePath === '/' ? '' : routePath.replace(/^\//, '');
            const pageDir = routeSubPath ? path.join(pagesRoot, routeSubPath) : pagesRoot;
            // Use pre-rendered path if available (slow-rendered pages have
            // slow bindings resolved — hydrate script should not adopt them)
            const preRenderedPath = path.join(
                dirPath,
                'build/pre-rendered',
                routeSubPath,
                'page.jay-html',
            );
            const hydrateSourcePath = fs.existsSync(preRenderedPath)
                ? preRenderedPath
                : path.join(pageDir, 'page.jay-html');

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
            await page.goto(`${devServerUrl}${routePath}`, { waitUntil: 'load' });
            expect(errors).toEqual([]);
        } finally {
            await page.close();
        }
    });

    it('no hydration warnings', async () => {
        const page = await browser.newPage();
        const warnings: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'warning' && msg.text().includes('[jay hydration]')) {
                warnings.push(msg.text());
            }
        });
        try {
            await page.goto(`${devServerUrl}${routePath}`, { waitUntil: 'load' });
            await waitForHydration(page);
            expect(warnings).toEqual([]);
        } finally {
            await page.close();
        }
    }, 15000);

    if (opts.ssrChecks) {
        it('SSR content has expected structure', async () => {
            const response = await fetch(`${devServerUrl}${routePath}`);
            const html = await response.text();
            const targetHtml = extractTargetContent(html);
            opts.ssrChecks!(targetHtml);
        });
    }

    if (opts.expectedViewState) {
        it('automation API returns expected viewState', async () => {
            const page = await browser.newPage();
            try {
                await page.goto(`${devServerUrl}${routePath}`, { waitUntil: 'load' });
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
                await page.goto(`${devServerUrl}${routePath}`, { waitUntil: 'load' });
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
                await page.goto(`${devServerUrl}${routePath}`, { waitUntil: 'load' });
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

    describe('8a. Headfull FS — static placement', () => {
        testFixture('8a-page-headfull-fs-static', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Headfull FS Test');
                expect(await page.textContent('#target .cart-count')).toEqual('5');
            },
            interactivityChecks: async (page) => {
                // Initial value
                expect(await page.textContent('#target .cart-count')).toEqual('5');
                // Click increment button
                await page.click('#target button');
                // Value should increase
                await page.waitForFunction(
                    () => {
                        return document.querySelector('#target .cart-count')?.textContent === '6';
                    },
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target .cart-count')).toEqual('6');
            },
        });
    });

    describe('8b. Headfull FS — under condition', () => {
        testFixture('8b-page-headfull-fs-conditional', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Conditional Headfull FS');
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
                    () => document.querySelector('#target .value')?.textContent === '11',
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target .value')).toEqual('11');

                // Toggle: hide widget
                await page.click('button:text("Toggle")');
                await page.waitForFunction(
                    () => document.querySelector('#target p')?.textContent === 'Widget hidden',
                    { timeout: 2000 },
                );
                expect(await page.$('#target .widget')).toBeNull();
                expect(await page.textContent('#target p')).toEqual('Widget hidden');

                // Toggle: show widget again
                await page.click('button:text("Toggle")');
                await page.waitForFunction(
                    () => document.querySelector('#target .widget') !== null,
                    { timeout: 2000 },
                );
                expect(await page.$('#target .widget')).toBeTruthy();
            },
        });
    });

    describe('8c. Headfull FS — inside forEach with wrapper', () => {
        testFixture('8c-page-headfull-fs-foreach', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('ForEach Headfull FS');
                const cards = await page.$$('#target .card');
                expect(cards).toHaveLength(3);
                expect(await cards[0].textContent()).toContain('Item 1');
                expect(await cards[1].textContent()).toContain('Item 2');
                expect(await cards[2].textContent()).toContain('Item 3');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(3);
                expect(await widgets[0].textContent()).toContain('10');
                expect(await widgets[1].textContent()).toContain('20');
                expect(await widgets[2].textContent()).toContain('30');
            },
            interactivityChecks: async (page) => {
                const buttons = await page.$$('#target .widget button');
                expect(buttons).toHaveLength(3);
                await buttons[1].click();
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[1]?.textContent === '21';
                    },
                    { timeout: 2000 },
                );
                let values = await page.$$('#target .widget .value');
                expect(await values[0].textContent()).toEqual('10');
                expect(await values[1].textContent()).toEqual('21');
                expect(await values[2].textContent()).toEqual('30');

                // Add a new item
                await page.click('button:text("Add Item")');
                await page.waitForFunction(
                    () => document.querySelectorAll('#target .widget').length === 4,
                    { timeout: 2000 },
                );
                let widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(4);
                expect(await widgets[3].textContent()).toContain('Item 4');
                expect(await widgets[3].textContent()).toContain('40');

                // Remove last item
                await page.click('button:text("Remove Last")');
                await page.waitForFunction(
                    () => document.querySelectorAll('#target .widget').length === 3,
                    { timeout: 2000 },
                );
                widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(3);
                values = await page.$$('#target .widget .value');
                expect(await values[1].textContent()).toEqual('21');
            },
        });
    });

    describe('8d. Headfull FS — inside slowForEach', () => {
        testFixture('8d-page-headfull-fs-slow-foreach', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('SlowForEach Headfull FS');
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

    describe('8e. Headfull FS — forEach with preceding sections + carry-forward', () => {
        testFixture('8e-page-headfull-fs-foreach-nested', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Nested ForEach Headfull FS');
                expect(await page.textContent('#target .section h2')).toEqual('Static Section');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(2);
                expect(await widgets[0].textContent()).toContain('10');
                expect(await widgets[1].textContent()).toContain('20');
                const names = await page.$$('#target .card strong');
                expect(names).toHaveLength(2);
                expect(await names[0].textContent()).toEqual('Alpha');
                expect(await names[1].textContent()).toEqual('Beta');
            },
            interactivityChecks: async (page) => {
                const buttons = await page.$$('#target .widget button');
                expect(buttons).toHaveLength(2);
                // Click first widget (itemId="1" → step=1)
                await buttons[0].click();
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[0]?.textContent === '11';
                    },
                    { timeout: 2000 },
                );
                let values = await page.$$('#target .widget .value');
                expect(await values[0].textContent()).toEqual('11');
                expect(await values[1].textContent()).toEqual('20');

                // Click second widget (itemId="2" → step=2, verifies carry-forward)
                await buttons[1].click();
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[1]?.textContent === '22';
                    },
                    { timeout: 2000 },
                );
                values = await page.$$('#target .widget .value');
                expect(await values[1].textContent()).toEqual('22');
            },
        });
    });

    describe('8f. Headfull FS — two static instances with different props', () => {
        testFixture('8f-page-headfull-fs-two-instances', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Two Instances Headfull FS');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(2);
                expect(await widgets[0].textContent()).toContain('Item 1');
                expect(await widgets[0].textContent()).toContain('10');
                expect(await widgets[1].textContent()).toContain('Item 3');
                expect(await widgets[1].textContent()).toContain('30');
            },
            interactivityChecks: async (page) => {
                const buttons = await page.$$('#target .widget button');
                expect(buttons).toHaveLength(2);
                await buttons[1].click();
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[1]?.textContent === '31';
                    },
                    { timeout: 2000 },
                );
                const values = await page.$$('#target .widget .value');
                expect(await values[0].textContent()).toEqual('10');
                expect(await values[1].textContent()).toEqual('31');
            },
        });
    });

    describe('8g. Headfull FS — fast-only page (no slow phase)', () => {
        testFixture('8g-page-headfull-fs-fast-only', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Fast Only Headfull FS');
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

    describe('8h. Headfull FS — with component CSS', () => {
        testFixture('8h-page-headfull-fs-with-css', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Headfull FS CSS Test');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(1);
                expect(await widgets[0].textContent()).toContain('10');
            },
            interactivityChecks: async (page) => {
                // Verify CSS is applied
                const borderStyle = await page.evaluate(() => {
                    const widget = document.querySelector('#target .widget');
                    return widget ? getComputedStyle(widget).borderStyle : '';
                });
                expect(borderStyle).toEqual('solid');

                // Interactivity works
                await page.click('#target .widget button');
                await page.waitForFunction(
                    () => {
                        const values = document.querySelectorAll('#target .widget .value');
                        return values[0]?.textContent === '11';
                    },
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target .value')).toEqual('11');
            },
        });
    });

    describe('8i. Headfull FS — nested headless inside headfull (DL#123 Scenario C)', () => {
        testFixture('8i-page-headfull-fs-nested-headless', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Nested Headless Test');
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

    describe('8j. Headfull FS — nested headfull inside headfull (DL#123 Scenario B)', () => {
        testFixture('8j-page-headfull-fs-nested-headfull', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Nested Headfull Test');
                expect(await page.textContent('#target .cart-count')).toEqual('5');
                expect(await page.textContent('#target .sidebar')).toEqual('Sidebar');
            },
            interactivityChecks: async (page) => {
                // Initial value
                expect(await page.textContent('#target .cart-count')).toEqual('5');
                // Click increment button
                await page.click('#target button');
                // Value should increase
                await page.waitForFunction(
                    () => {
                        return document.querySelector('#target .cart-count')?.textContent === '6';
                    },
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target .cart-count')).toEqual('6');
            },
        });
    });

    describe('8k. Headfull FS — separate pages/components dirs with deep paths', () => {
        testFixture('8k-page-headfull-fs-separate-dirs', {
            pagesSubdir: 'pages',
            routePath: '/category',
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Headfull FS Test');
                expect(await page.textContent('#target .cart-count')).toEqual('5');
            },
            interactivityChecks: async (page) => {
                // Initial value
                expect(await page.textContent('#target .cart-count')).toEqual('5');
                // Click increment button
                await page.click('#target button');
                // Value should increase
                await page.waitForFunction(
                    () => {
                        return document.querySelector('#target .cart-count')?.textContent === '6';
                    },
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target .cart-count')).toEqual('6');
            },
        });
    });

    describe('9. Client ViewState mismatch (DL#112)', () => {
        // Uses a KEYED headless component (key="status") that overrides SSR values
        // in its interactive constructor. This tests the mutation path:
        // render() aliases defaultViewState and mutates it via viewState[key] = ...
        testFixture('9a-page-client-viewstate-mismatch', {
            expectedViewState: {
                title: 'ViewState Mismatch Test',
                status: {
                    // Client overrides SSR values (SSR had: showBanner=false, counter=0)
                    showBanner: true,
                    bannerText: 'Client Banner',
                    counter: 5,
                },
            },
            hydrationChecks: async (page) => {
                // Title from slow phase — always present
                expect(await page.textContent('#target h1')).toEqual('ViewState Mismatch Test');

                // Banner: SSR had status.showBanner=false, but client sets it to true.
                // After hydration + reconciliation, the banner should be visible
                // with the client's text.
                await page.waitForFunction(
                    () => document.querySelector('#target .banner') !== null,
                    { timeout: 2000 },
                );
                expect(await page.$('#target .banner')).toBeTruthy();
                expect(await page.textContent('#target .banner-text')).toEqual('Client Banner');

                // Counter: SSR had 0, client sets 5
                expect(await page.textContent('#target .counter')).toEqual('Count: 5');
            },
            interactivityChecks: async (page) => {
                // Click increment: counter goes from 5 to 6
                await page.click('#target button');
                await page.waitForFunction(
                    () => document.querySelector('#target .counter')?.textContent === 'Count: 6',
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target .counter')).toEqual('Count: 6');

                // Banner should still be visible
                expect(await page.$('#target .banner')).toBeTruthy();
            },
        });
    });

    describe('10a. Nested slow forEach', () => {
        testFixture('10a-nested-slow-foreach', {
            hydrationChecks: async (page) => {
                // Title renders
                expect(await page.textContent('#target h1')).toEqual('Nested Slow ForEach');

                // Both categories render with correct headings
                const headings = await page.$$('#target .category h2');
                expect(headings).toHaveLength(2);
                expect(await headings[0].textContent()).toEqual('Fruits');
                expect(await headings[1].textContent()).toEqual('Vegetables');

                // All items render under correct categories with labels and counts
                const categories = await page.$$('#target .category');
                expect(categories).toHaveLength(2);

                const fruitsItems = await categories[0].$$('.item');
                expect(fruitsItems).toHaveLength(2);
                expect(await fruitsItems[0].$eval('.label', (el) => el.textContent)).toEqual(
                    'Apple',
                );
                expect(await fruitsItems[0].$eval('.count', (el) => el.textContent)).toEqual('10');
                expect(await fruitsItems[1].$eval('.label', (el) => el.textContent)).toEqual(
                    'Banana',
                );
                expect(await fruitsItems[1].$eval('.count', (el) => el.textContent)).toEqual('20');

                const vegItems = await categories[1].$$('.item');
                expect(vegItems).toHaveLength(2);
                expect(await vegItems[0].$eval('.label', (el) => el.textContent)).toEqual('Carrot');
                expect(await vegItems[0].$eval('.count', (el) => el.textContent)).toEqual('30');
                expect(await vegItems[1].$eval('.label', (el) => el.textContent)).toEqual('Daikon');
                expect(await vegItems[1].$eval('.count', (el) => el.textContent)).toEqual('40');
            },
        });
    });

    describe('10b. Nested fast forEach', () => {
        testFixture('10b-nested-fast-foreach', {
            hydrationChecks: async (page) => {
                // Title renders
                expect(await page.textContent('#target h1')).toEqual('Nested Fast ForEach');

                // Both groups render with correct headings
                const headings = await page.$$('#target .group h2');
                expect(headings).toHaveLength(2);
                expect(await headings[0].textContent()).toEqual('Group A');
                expect(await headings[1].textContent()).toEqual('Group B');

                // Nested items render correctly
                const groups = await page.$$('#target .group');
                expect(groups).toHaveLength(2);

                const groupAItems = await groups[0].$$('li');
                expect(groupAItems).toHaveLength(2);
                expect(await groupAItems[0].textContent()).toEqual('Item A1');
                expect(await groupAItems[1].textContent()).toEqual('Item A2');

                const groupBItems = await groups[1].$$('li');
                expect(groupBItems).toHaveLength(3);
                expect(await groupBItems[0].textContent()).toEqual('Item B1');
                expect(await groupBItems[1].textContent()).toEqual('Item B2');
                expect(await groupBItems[2].textContent()).toEqual('Item B3');
            },
        });
    });

    describe('10c. Nested conditional', () => {
        testFixture('10c-nested-conditional', {
            hydrationChecks: async (page) => {
                // Title renders
                expect(await page.textContent('#target h1')).toEqual('Nested Conditional');

                // All 3 items render
                const items = await page.$$('#target .item');
                expect(items).toHaveLength(3);

                // Names render correctly
                const names = await page.$$('#target .item .name');
                expect(await names[0].textContent()).toEqual('Alpha');
                expect(await names[1].textContent()).toEqual('Beta');
                expect(await names[2].textContent()).toEqual('Gamma');

                // Active badges: Alpha(active), Beta(inactive), Gamma(active)
                const activeBadge0 = await items[0].$('.badge');
                expect(activeBadge0).toBeTruthy();
                const inactiveBadge0 = await items[0].$('.badge-off');
                expect(inactiveBadge0).toBeNull();

                const activeBadge1 = await items[1].$('.badge');
                expect(activeBadge1).toBeNull();
                const inactiveBadge1 = await items[1].$('.badge-off');
                expect(inactiveBadge1).toBeTruthy();

                const activeBadge2 = await items[2].$('.badge');
                expect(activeBadge2).toBeTruthy();
                const inactiveBadge2 = await items[2].$('.badge-off');
                expect(inactiveBadge2).toBeNull();
            },
            interactivityChecks: async (page) => {
                // Toggle Beta (inactive → active): click the second toggle button
                const buttons = await page.$$('#target .item button');
                expect(buttons).toHaveLength(3);
                await buttons[1].click();

                // Beta should now show "Active" badge
                await page.waitForFunction(
                    () => {
                        const items = document.querySelectorAll('#target .item');
                        return items[1]?.querySelector('.badge') !== null;
                    },
                    { timeout: 2000 },
                );
                const items = await page.$$('#target .item');
                expect(await items[1].$('.badge')).toBeTruthy();
                expect(await items[1].$('.badge-off')).toBeNull();

                // Alpha and Gamma unchanged
                expect(await items[0].$('.badge')).toBeTruthy();
                expect(await items[0].$('.badge-off')).toBeNull();
                expect(await items[2].$('.badge')).toBeTruthy();
                expect(await items[2].$('.badge-off')).toBeNull();
            },
        });
    });

    describe('10d. Nested combination', () => {
        testFixture('10d-nested-combination', {
            hydrationChecks: async (page) => {
                // Title renders
                expect(await page.textContent('#target h1')).toEqual('Nested Combination');

                // Both categories render
                const categories = await page.$$('#target .category');
                expect(categories).toHaveLength(2);

                // Category headings
                const headings = await page.$$('#target .category h2');
                expect(await headings[0].textContent()).toEqual('Enabled');
                expect(await headings[1].textContent()).toEqual('Disabled');

                // Slow conditional: showDetails=true for Enabled, false for Disabled
                const details0 = await categories[0].$('.details');
                expect(details0).toBeTruthy();
                const details1 = await categories[1].$('.details');
                expect(details1).toBeNull();

                // Fast conditional: isActive=true for Enabled, false for Disabled
                const active0 = await categories[0].$('.active-badge');
                expect(active0).toBeTruthy();
                const active1 = await categories[1].$('.active-badge');
                expect(active1).toBeNull();

                // Fast forEach items under each category
                const enabledItems = await categories[0].$$('li');
                expect(enabledItems).toHaveLength(2);
                expect(await enabledItems[0].textContent()).toEqual('E-One');
                expect(await enabledItems[1].textContent()).toEqual('E-Two');

                const disabledItems = await categories[1].$$('li');
                expect(disabledItems).toHaveLength(1);
                expect(await disabledItems[0].textContent()).toEqual('D-One');
            },
            interactivityChecks: async (page) => {
                // Toggle "Enabled" category: isActive true → false
                const categories = await page.$$('#target .category');
                const enabledToggle = await categories[0].$('button');
                await enabledToggle!.click();
                await page.waitForFunction(
                    () =>
                        document
                            .querySelectorAll('#target .category')[0]
                            ?.querySelector('.active-badge') === null,
                    { timeout: 2000 },
                );
                // Active badge should be gone
                expect(await categories[0].$('.active-badge')).toBeNull();
                // Items and other content should still be intact
                const enabledItems = await categories[0].$$('li');
                expect(enabledItems).toHaveLength(2);
                expect(await enabledItems[0].textContent()).toEqual('E-One');

                // Toggle "Disabled" category: isActive false → true
                const disabledToggle = await categories[1].$('button');
                await disabledToggle!.click();
                await page.waitForFunction(
                    () =>
                        document
                            .querySelectorAll('#target .category')[1]
                            ?.querySelector('.active-badge') !== null,
                    { timeout: 2000 },
                );
                // Active badge should appear
                expect(await categories[1].$('.active-badge')).toBeTruthy();
                // Items should still be intact
                const disabledItems = await categories[1].$$('li');
                expect(disabledItems).toHaveLength(1);
                expect(await disabledItems[0].textContent()).toEqual('D-One');
            },
        });
    });

    describe('11a. Async data — resolved promise', () => {
        testFixture('11a-async-data', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Async Data Test');
                await page.waitForFunction(
                    () => document.querySelector('#target .resolved') !== null,
                    { timeout: 3000 },
                );
                expect(await page.textContent('#target .resolved')).toEqual('Hello from async!');
                expect(await page.$('#target .loading')).toBeNull();
                expect(await page.$('#target .error')).toBeNull();
            },
        });
    });

    describe('11b. Async data — rejected promise', () => {
        testFixture('11b-async-data-rejected', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Async Rejected Test');
                await page.waitForFunction(
                    () => document.querySelector('#target .error') !== null,
                    { timeout: 3000 },
                );
                expect(await page.textContent('#target .error')).toEqual('Error: Failed to load');
                expect(await page.$('#target .resolved')).toBeNull();
                expect(await page.$('#target .loading')).toBeNull();
            },
        });
    });

    describe('11c. Async sub-contract (object)', () => {
        testFixture('11c-async-sub-contract', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Async Object Test');
                await page.waitForFunction(() => document.querySelector('#target .name') !== null, {
                    timeout: 3000,
                });
                expect(await page.textContent('#target .name')).toEqual('Alice');
                expect(await page.textContent('#target .email')).toEqual('alice@test.com');
                expect(await page.$('#target .loading')).toBeNull();
            },
        });
    });

    describe('11d. Async repeated sub-contract (array)', () => {
        testFixture('11d-async-repeated', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Async Array Test');
                await page.waitForFunction(
                    () => document.querySelector('#target .resolved') !== null,
                    { timeout: 3000 },
                );
                expect(await page.textContent('#target .resolved')).toEqual('Items loaded');
                expect(await page.$('#target .loading')).toBeNull();
            },
        });
    });

    describe('11e. Multiple async properties (mixed resolve/reject)', () => {
        testFixture('11e-async-multiple', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Multiple Async Test');
                await page.waitForFunction(
                    () =>
                        document.querySelector('#target .data1-resolved') !== null &&
                        document.querySelector('#target .data2-error') !== null,
                    { timeout: 3000 },
                );
                // data1 resolved
                expect(await page.textContent('#target .data1-resolved')).toEqual('First resolved');
                expect(await page.$('#target .data1-loading')).toBeNull();
                expect(await page.$('#target .data1-error')).toBeNull();
                // data2 rejected
                expect(await page.textContent('#target .data2-error')).toEqual(
                    'Error: Second failed',
                );
                expect(await page.$('#target .data2-resolved')).toBeNull();
                expect(await page.$('#target .data2-loading')).toBeNull();
            },
        });
    });

    describe('11g. Async with delayed resolution', () => {
        testFixture('11g-async-delayed', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Async Delayed Test');
                // SSR waits for the promise (100ms setTimeout) before sending response
                await page.waitForFunction(
                    () => document.querySelector('#target .resolved') !== null,
                    { timeout: 3000 },
                );
                expect(await page.textContent('#target .resolved')).toEqual('Delayed response');
                expect(await page.$('#target .loading')).toBeNull();
            },
        });
    });
});
