/**
 * Round-trip integration test for the Figma import/export pipeline.
 *
 * Requires a running dev server for the store-light example.
 * Start it with:   cd wix/examples/store-light && yarn dev --test-mode
 *
 * Then run:
 *   STORE_LIGHT_URL=http://localhost:3000 \
 *   STORE_LIGHT_DIR=/Users/noamsi/projects/clean/wix/examples/store-light \
 *   yarn vitest run test/vendors/figma-import/round-trip.test.ts
 *
 * The test performs a full round-trip:
 *   jay-html → (import pipeline) → Figma JSON → (export pipeline) → jay-html
 * and saves all intermediate artifacts + screenshots in a local _results directory
 * so the developer (or AI agent) can inspect them without opening Figma.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { createEditorHandlers } from '../../../lib/editor-handlers';
import type {
    ExportMessage,
    ImportMessage,
    FigmaVendorDocument,
} from '@jay-framework/editor-protocol';
import type { JayConfig } from '../../../lib/config';

const STORE_LIGHT_DIR = process.env.STORE_LIGHT_DIR;
const STORE_LIGHT_URL = process.env.STORE_LIGHT_URL;

const shouldRun = STORE_LIGHT_DIR || STORE_LIGHT_URL;

const VIEWPORT = { width: 1280, height: 900 };

describe.skipIf(!shouldRun)('Round-trip: store-light /products', () => {
    let serverUrl: string;
    let serverProcess: ChildProcess | null = null;
    let storeLightDir: string;
    let originalJayHtml: string;
    let jayHtmlPath: string;

    const resultsDir = path.join(__dirname, '__round-trip-results__');

    beforeAll(async () => {
        storeLightDir =
            STORE_LIGHT_DIR ||
            path.resolve(__dirname, '../../../../../../wix/examples/store-light');

        if (!fs.existsSync(path.join(storeLightDir, 'package.json'))) {
            throw new Error(
                `store-light directory not found at ${storeLightDir}. ` +
                    `Set STORE_LIGHT_DIR env var to the correct path.`,
            );
        }

        // Back up the original page.jay-html so we can restore it after the test
        jayHtmlPath = path.join(storeLightDir, 'src/pages/products/page.jay-html');
        originalJayHtml = fs.readFileSync(jayHtmlPath, 'utf-8');

        if (STORE_LIGHT_URL) {
            serverUrl = STORE_LIGHT_URL;
        } else {
            serverProcess = spawn('yarn', ['dev', '--test-mode'], {
                cwd: storeLightDir,
                shell: true,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, NODE_ENV: 'development' },
            });
            serverUrl = await waitForServer(45000);
        }

        process.env.DEV_SERVER_URL = serverUrl;
        fs.mkdirSync(resultsDir, { recursive: true });
    }, 60000);

    afterAll(async () => {
        // Restore the original page.jay-html
        if (originalJayHtml && jayHtmlPath) {
            fs.writeFileSync(jayHtmlPath, originalJayHtml, 'utf-8');
            console.log('[RoundTrip] Restored original page.jay-html');
        }

        if (serverProcess) {
            try {
                await fetch(`${serverUrl}/_jay/shutdown`, { method: 'POST' });
            } catch {
                serverProcess.kill();
            }
        }
    }, 10000);

    it('should import /products and produce Figma JSON with screenshots', async () => {
        const pagesBase = path.join(storeLightDir, 'src/pages');
        const config: Required<JayConfig> = {
            devServer: {
                portRange: [3000, 3010],
                pagesBase,
                componentsBase: path.join(storeLightDir, 'src/components'),
                publicFolder: path.join(storeLightDir, 'public'),
                configBase: path.join(storeLightDir, 'src/config'),
            },
            editorServer: {
                portRange: [3101, 3200],
                editorId: 'round-trip-test',
            },
        };

        const handlers = createEditorHandlers(config, './tsconfig.json', storeLightDir);

        // --- ORIGINAL SCREENSHOT (before any modifications) ---
        let browser: any;
        try {
            const { chromium } = await import('playwright');
            browser = await chromium.launch({ headless: true });
            const ctx = await browser.newContext({ viewport: VIEWPORT });
            const page = await ctx.newPage();
            await page.goto(`${serverUrl}/products`, {
                waitUntil: 'networkidle',
                timeout: 15000,
            });
            // Extra wait for client-side rendering to settle
            await page.waitForTimeout(2000);
            await page.screenshot({
                path: path.join(resultsDir, 'screenshot-original.png'),
                fullPage: true,
            });
            await ctx.close();
            console.log('[RoundTrip] Original screenshot saved');
        } catch (err) {
            console.warn('[RoundTrip] Original screenshot failed:', (err as Error).message);
        }

        // --- IMPORT ---
        const importMsg: ImportMessage<FigmaVendorDocument> = {
            type: 'import',
            vendorId: 'figma',
            pageUrl: '/products',
        };

        console.log('[RoundTrip] Starting import...');
        const importStart = Date.now();
        const importResponse = await handlers.onImport(importMsg);
        const importDuration = Date.now() - importStart;
        console.log(`[RoundTrip] Import completed in ${importDuration}ms`);

        expect(importResponse.success).toBe(true);
        expect(importResponse.vendorDoc).toBeDefined();

        const figmaDoc = importResponse.vendorDoc as FigmaVendorDocument;

        fs.writeFileSync(
            path.join(resultsDir, 'import-figma-doc.json'),
            JSON.stringify(figmaDoc, null, 2),
            'utf-8',
        );

        // --- EXPORT (round-trip) ---
        const exportMsg: ExportMessage<FigmaVendorDocument> = {
            type: 'export',
            vendorId: 'figma',
            pageUrl: '/products',
            vendorDoc: figmaDoc,
        };

        console.log('[RoundTrip] Starting export...');
        const exportStart = Date.now();
        const exportResponse = await handlers.onExport(exportMsg);
        const exportDuration = Date.now() - exportStart;
        console.log(`[RoundTrip] Export completed in ${exportDuration}ms`);

        expect(exportResponse.success).toBe(true);

        const exportedJayHtml = fs.readFileSync(
            path.join(pagesBase, 'products', 'page.jay-html'),
            'utf-8',
        );
        fs.writeFileSync(path.join(resultsDir, 'export-jay-html.html'), exportedJayHtml, 'utf-8');

        // --- POST-EXPORT SCREENSHOT ---
        if (browser) {
            try {
                const ctx = await browser.newContext({ viewport: VIEWPORT });
                const page = await ctx.newPage();
                // Wait for dev server to pick up the new jay-html
                await new Promise((r) => setTimeout(r, 2000));
                await page.goto(`${serverUrl}/products`, {
                    waitUntil: 'networkidle',
                    timeout: 15000,
                });
                await page.waitForTimeout(2000);
                await page.screenshot({
                    path: path.join(resultsDir, 'screenshot-after-export.png'),
                    fullPage: true,
                });
                await ctx.close();
                await browser.close();
                console.log('[RoundTrip] Post-export screenshot saved');
            } catch (err) {
                console.warn('[RoundTrip] Post-export screenshot failed:', (err as Error).message);
                await browser?.close();
            }
        }

        // --- SUMMARY ---
        const summary = {
            importDurationMs: importDuration,
            exportDurationMs: exportDuration,
            figmaDocNodeCount: countNodes(figmaDoc),
            exportedJayHtmlLines: exportedJayHtml.split('\n').length,
            exportedJayHtmlSize: exportedJayHtml.length,
            originalJayHtmlLines: originalJayHtml.split('\n').length,
            originalJayHtmlSize: originalJayHtml.length,
        };

        fs.writeFileSync(
            path.join(resultsDir, 'summary.json'),
            JSON.stringify(summary, null, 2),
            'utf-8',
        );

        console.log('[RoundTrip] Summary:', summary);
        console.log(`[RoundTrip] All results saved to: ${resultsDir}`);

        // Copy import screenshots to results dir
        const screenshotDir = path.join(pagesBase, 'products', '_debug', 'screenshots');
        if (fs.existsSync(screenshotDir)) {
            const screenshots = fs.readdirSync(screenshotDir).filter((f) => f.endsWith('.png'));
            console.log(
                `[RoundTrip] Import screenshots: ${screenshots.length} files in ${screenshotDir}`,
            );
            expect(screenshots.length).toBeGreaterThan(0);

            for (const file of screenshots) {
                fs.copyFileSync(
                    path.join(screenshotDir, file),
                    path.join(resultsDir, `import-${file}`),
                );
            }
        }
    }, 120000);
});

function countNodes(node: any): number {
    let count = 1;
    if (node.children) {
        for (const child of node.children) {
            count += countNodes(child);
        }
    }
    return count;
}

async function waitForServer(timeout: number): Promise<string> {
    const start = Date.now();
    const ports = [3000, 3300];

    while (Date.now() - start < timeout) {
        for (const port of ports) {
            try {
                const res = await fetch(`http://localhost:${port}/_jay/health`);
                if (res.ok) {
                    return `http://localhost:${port}`;
                }
            } catch {
                // Not ready yet
            }
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Dev server not ready within ${timeout}ms`);
}
