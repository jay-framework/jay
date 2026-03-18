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

/** Read expected fixture file */
function readFixture(dirName: string, fileName: string): string {
    return stripTsDirectives(fs.readFileSync(path.join(__dirname, dirName, fileName), 'utf-8'));
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
function testFixtureMode(
    dirName: string,
    opts: TestFixtureOpts & { warmCache?: boolean } = {},
) {
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
    if (!opts.disableSSR && (fs.existsSync(ssrFixturePath) || process.env.UPDATE_FIXTURES === '1')) {
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
    if (!opts.disableSSR && (fs.existsSync(hydrateFixturePath) || process.env.UPDATE_FIXTURES === '1')) {
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

            let actual = transformResult!.code
                .replace(new RegExp(dirPath.replace(/[/\\]/g, '[/\\\\]'), 'g'), '.')
                .replace(/\/\/# sourceMappingURL=.*/, '');
            actual = await prettify(actual);

            if (process.env.UPDATE_FIXTURES === '1') {
                const lines = actual.split('\n');
                const result: string[] = [];
                for (const line of lines) {
                    if (line.startsWith('} from \'') || (line.startsWith('import ') && line.includes(' from \''))) result.push('// @ts-ignore');
                    result.push(line);
                }
                fs.writeFileSync(hydrateFixturePath, result.join('\n'));
            }
            const expected = readFixture(dirName, hydrateFixtureName);
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
        testFixture('page-static-only', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Static Page');
                expect(await page.textContent('#target p')).toEqual('No dynamic content here');
                const items = await page.$$('#target li');
                expect(items).toHaveLength(2);
            },
        });
    });

    describe('2a. Dynamic text', () => {
        testFixture('2a-page-dynamic-text', {
            expectedViewState: {
                title: 'Hello Dynamic',
                fastCount: 10,
                interactiveCount: 20,
            },
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Hello Dynamic');
                expect(await page.textContent('#target p')).toEqual('Fast Count: 10');
                expect(await page.textContent('#target p >> nth=1')).toEqual('Interactive Count: 20');
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

    describe('3. Conditionals', () => {
        testFixture('page-conditional', {
            expectedViewState: { isActive: true, message: 'Conditional Test' },
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Conditional Test');
                // isActive=true → "Active" span should be visible
                const activeSpan = await page.$('#target span:text("Active")');
                expect(activeSpan).toBeTruthy();
            },
        });
    });

    describe('4. forEach', () => {
        testFixture('page-foreach', {
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

    describe('5. slowForEach', () => {
        testFixture('page-slow-foreach', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('SlowForEach Test');
                const cards = await page.$$('#target .card');
                expect(cards).toHaveLength(2);
                expect(await cards[0].textContent()).toContain('Widget A');
                expect(await cards[0].textContent()).toContain('29.99');
                expect(await cards[1].textContent()).toContain('Widget B');
                expect(await cards[1].textContent()).toContain('49.99');
            },
        });
    });

    describe('6a. Headless — static placement', () => {
        testFixture('page-headless-static', {

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

    describe('6b. Headless — under condition', () => {
        testFixture('page-headless-conditional', {

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

    describe('6c. Headless — under forEach (nested in wrapper div)', () => {
        // forEach widget is fast-only (no slow phase) — no need for slow render cache.
        // Widget is inside <div class="card"><strong>{name}</strong><jay:widget>...
        // This tests coordinate resolution when headless instance has intermediate
        // wrapper elements between the forEach item root and the jay:xxx tag.
        testFixture('page-headless-foreach', {
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

    describe('6e-2. Headless — two static instances with different props', () => {
        // Two <jay:widget> instances in different parent scopes with different props.
        // Both must get their own fast ViewState and carryForward —
        // the __headlessInstances key must be unique per instance.
        testFixture('page-headless-two-instances', {

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

    describe('6e. Headless — under forEach with wrapper + preceding sections', () => {
        // Reproduces fake-shop pattern: multiple sections before the forEach,
        // headless instance inside <div class="card"><strong>{name}</strong><jay:widget>.
        // Tests that coordinates are correct when forEach is not the first child.
        // Also verifies forEach carry forward reaches the interactive constructor.
        testFixture('page-headless-foreach-nested', {

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

    describe('7a. Headless — forEach with disableSSR (client-only)', () => {
        // Same fixture as 6e but with disableSSR: true.
        // Tests that headless instances inside forEach work with client-only rendering
        // (no SSR, no hydration — element target).
        testFixture('page-headless-foreach-nested', {
            disableSSR: true,
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Nested ForEach Test');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(2);
                expect(await widgets[0].textContent()).toContain('10');
                expect(await widgets[1].textContent()).toContain('20');
            },
            interactivityChecks: async (page) => {
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
                const values = await page.$$('#target .widget .value');
                expect(await values[0].textContent()).toEqual('11');
            },
        });
    });

    describe('7b. Headless — two static instances with disableSSR (client-only)', () => {
        // Same fixture as 6e-2 but with disableSSR: true.
        // Tests that multiple instances work with client-only rendering.
        testFixture('page-headless-two-instances', {
            disableSSR: true,
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Two Instances Test');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(2);
                expect(await widgets[0].textContent()).toContain('10');
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

    // DL#107 gap: fast-only pages lack the discovery pipeline (no slow phase)
    describe.skip('7c. Fast-only page with headless instance', () => {
        // Page has withFastRender + withInteractive but NO withSlowlyRender.
        // Tests that headless instances work without any slow phase.
        testFixture('page-fast-only', {

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

    // DL#107 gap: interactive-only pages render "undefined" for SSR values
    describe.skip('7d. Interactive-only page (no slow, no fast)', () => {
        // Page has only withInteractive — no server phases at all.
        // Tests that the simplest possible interactive page works.
        // SSR renders with empty viewState (undefined values), but after hydration
        // the interactive constructor provides the initial values.
        testFixture('page-interactive-only', {

            hydrationChecks: async (page) => {
                // Wait for the interactive constructor's first render to update the DOM
                await page.waitForFunction(
                    () => document.querySelector('#target h1')?.textContent === 'Interactive Only',
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target h1')).toEqual('Interactive Only');
                expect(await page.textContent('#target p')).toContain('Count: 0');
            },
            interactivityChecks: async (page) => {
                await page.click('#target button');
                await page.waitForFunction(
                    () => {
                        return document.querySelector('#target p')?.textContent === 'Count: 1';
                    },
                    { timeout: 2000 },
                );
                expect(await page.textContent('#target p')).toEqual('Count: 1');
            },
        });
    });

    describe('6d. Headless — under slowForEach', () => {
        testFixture('page-headless-slow-foreach', {

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
});
