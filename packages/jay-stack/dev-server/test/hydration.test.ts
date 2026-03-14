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
import { prettifyHtml, prettify } from '@jay-framework/compiler-shared';
import { chromium, type Browser, type Page } from 'playwright';

// @vitest-environment node

/** Normalize HTML for stable comparison */
function normalizeHtml(html: string): string {
    return prettifyHtml(html.replace(/\s+/g, ' ').trim());
}

/** Extract the inner HTML of <div id="target">...</div> */
function extractTargetContent(html: string): string {
    const match = html.match(/<div id="target">([\s\S]*?)<\/div>\s*\n?\s*<script/);
    if (match) return match[1];
    const match2 = html.match(/<div id="target">([\s\S]*?)<\/div>/);
    return match2 ? match2[1] : '';
}

/** Read expected fixture file */
function readFixture(dirName: string, fileName: string): string {
    return fs.readFileSync(path.join(__dirname, dirName, fileName), 'utf-8');
}

// ============================================================================
// Test suite — one dev server per fixture directory
// ============================================================================

/**
 * Run tests for a single fixture page.
 * Starts its own dev server and Playwright browser.
 */
function testFixture(
    dirName: string,
    opts: {
        expectedViewState?: object;
        ssrChecks?: (targetHtml: string) => void;
        hydrationChecks?: (page: Page) => Promise<void>;
        interactivityChecks?: (page: Page) => Promise<void>;
    } = {},
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
            dontCacheSlowly: true,
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
    }, 30000);

    afterAll(async () => {
        await browser?.close();
        await new Promise<void>((resolve) => {
            (devServer as any)?._httpServer?.close(() => resolve());
        }).catch(() => {});
        await devServer?.viteServer?.close();
    });

    it('SSR output matches fixture', async () => {
        const response = await fetch(`${devServerUrl}/`);
        const html = await response.text();
        const ssrContent = normalizeHtml(extractTargetContent(html));
        const expected = normalizeHtml(readFixture(dirName, 'expected-ssr.html'));
        expect(ssrContent).toEqual(expected);
    });

    // Only test hydrate script fixture if the file exists
    const hydrateFixturePath = path.join(__dirname, dirName, 'expected-hydrate.ts');
    if (fs.existsSync(hydrateFixturePath)) {
        it('hydrate script matches fixture', async () => {
            const dirPath = path.resolve(__dirname, dirName);
            // Try ?jay-hydrate first (proper hydrate target), fall back to
            // ?import&jay-hydrate.ts (element target — what the browser loads
            // when the hydrate compilation fails for headless pages)
            let transformResult = await devServer.viteServer
                .transformRequest(path.resolve(dirPath, 'page.jay-html') + '?jay-hydrate')
                .catch(() => null);
            if (!transformResult?.code) {
                transformResult = await devServer.viteServer.transformRequest(
                    path.resolve(dirPath, 'page.jay-html') + '?import&jay-hydrate.ts',
                );
            }
            expect(transformResult?.code).toBeTruthy();

            let actual = transformResult!.code
                .replace(new RegExp(dirPath.replace(/[/\\]/g, '[/\\\\]'), 'g'), '.')
                .replace(/\/\/# sourceMappingURL=.*/, '');
            actual = await prettify(actual);

            const expected = readFixture(dirName, 'expected-hydrate.ts');
            expect(actual).toEqual(expected);
        });
    }

    it('page loads without errors', async () => {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        try {
            await page.goto(`${devServerUrl}/`, { waitUntil: 'networkidle' });
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
                await page.goto(`${devServerUrl}/`, { waitUntil: 'networkidle' });
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
                await page.goto(`${devServerUrl}/`, { waitUntil: 'networkidle' });
                await opts.hydrationChecks!(page);
            } finally {
                await page.close();
            }
        });
    }

    if (opts.interactivityChecks) {
        it('interactivity works after hydration', async () => {
            const page = await browser.newPage();
            try {
                await page.goto(`${devServerUrl}/`, { waitUntil: 'networkidle' });
                await opts.interactivityChecks!(page);
            } finally {
                await page.close();
            }
        });
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

    describe('2. Dynamic text', () => {
        testFixture('page-dynamic-text', {
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
                await page.waitForFunction(() => {
                    return document.querySelector('#target .value')?.textContent === '11';
                }, { timeout: 2000 });
                expect(await page.textContent('#target .value')).toEqual('11');
            },
        });
    });

    describe('6b. Headless — under condition', () => {
        testFixture('page-headless-conditional', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('Conditional Headless');
                expect(await page.textContent('#target .label')).toEqual('Item 1');
                expect(await page.textContent('#target .value')).toEqual('10');
            },
            interactivityChecks: async (page) => {
                expect(await page.textContent('#target .value')).toEqual('10');
                await page.click('#target button');
                await page.waitForFunction(() => {
                    return document.querySelector('#target .value')?.textContent === '11';
                }, { timeout: 2000 });
                expect(await page.textContent('#target .value')).toEqual('11');
            },
        });
    });

    describe('6c. Headless — under forEach', () => {
        testFixture('page-headless-foreach', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('ForEach Headless');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(3);
                expect(await page.textContent('#target .widget:nth-child(1) .label')).toEqual('Item 1');
                expect(await page.textContent('#target .widget:nth-child(1) .value')).toEqual('10');
                expect(await page.textContent('#target .widget:nth-child(2) .label')).toEqual('Item 2');
                expect(await page.textContent('#target .widget:nth-child(2) .value')).toEqual('20');
                expect(await page.textContent('#target .widget:nth-child(3) .label')).toEqual('Item 3');
                expect(await page.textContent('#target .widget:nth-child(3) .value')).toEqual('30');
            },
            interactivityChecks: async (page) => {
                // Click the second widget's increment button
                const buttons = await page.$$('#target .widget button');
                expect(buttons).toHaveLength(3);
                await buttons[1].click();
                // Second widget's value should change from 20 to 21
                await page.waitForFunction(() => {
                    const values = document.querySelectorAll('#target .widget .value');
                    return values[1]?.textContent === '21';
                }, { timeout: 2000 });
                const values = await page.$$('#target .widget .value');
                expect(await values[0].textContent()).toEqual('10'); // unchanged
                expect(await values[1].textContent()).toEqual('21'); // incremented
                expect(await values[2].textContent()).toEqual('30'); // unchanged
            },
        });
    });

    describe('6d. Headless — under slowForEach', () => {
        testFixture('page-headless-slow-foreach', {
            hydrationChecks: async (page) => {
                expect(await page.textContent('#target h1')).toEqual('SlowForEach Headless');
                const widgets = await page.$$('#target .widget');
                expect(widgets).toHaveLength(2);
                expect(await page.textContent('#target .widget:nth-child(1) .label')).toEqual('Item 1');
                expect(await page.textContent('#target .widget:nth-child(1) .value')).toEqual('10');
                expect(await page.textContent('#target .widget:nth-child(2) .label')).toEqual('Item 2');
                expect(await page.textContent('#target .widget:nth-child(2) .value')).toEqual('20');
            },
            interactivityChecks: async (page) => {
                expect(await page.textContent('#target .widget:nth-child(1) .value')).toEqual('10');
                await page.click('#target .widget:nth-child(1) button');
                await page.waitForFunction(() => {
                    const values = document.querySelectorAll('#target .widget .value');
                    return values[0]?.textContent === '11';
                }, { timeout: 2000 });
                expect(await page.textContent('#target .widget:nth-child(1) .value')).toEqual('11');
            },
        });
    });
});
