/**
 * Source-editing inspector tests (DL#219).
 *
 * Spins the dev server with `sourceEditing: true` for a fixture that has text, a `forEach`, and a
 * headless region, then drives the client-side inspector (`jay:inspectPoint` / `jay:inspectRect`) over
 * a real browser and asserts the `jay:inspectResult` shape.
 */

import { mkDevServer, type DevServer } from '../lib';
import { clearServerElementCache } from '@jay-framework/stack-server-build';
import { JayRollupConfig } from '@jay-framework/vite-plugin';
import path from 'path';
import fs from 'fs';
import http from 'node:http';
import { chromium, type Browser, type Page } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// @vitest-environment node

const DIR = '5c-page-headless-foreach';

interface InspectResult {
    file?: string;
    route?: string;
    node: {
        lines: { from: number; to: number };
        tag: string;
        html?: string;
        rect: { x: number; y: number; width: number; height: number };
        contentFromBinding?: boolean;
    } | null;
    stack: Array<{ kind: 'forEach' | 'region'; lines: any; itemId?: string; name?: string }>;
}

describe('source-editing inspector (DL#219)', () => {
    let devServer: DevServer;
    let browser: Browser;
    let url: string;

    beforeAll(async () => {
        const dirPath = path.resolve(__dirname, DIR);
        const express = await import('express');
        const app = express.default();
        const httpServer = http.createServer(app);

        devServer = await mkDevServer({
            pagesRootFolder: dirPath,
            projectRootFolder: dirPath,
            jayRollupConfig: {
                tsConfigFilePath: path.join(dirPath, 'tsconfig.json'),
            } as JayRollupConfig,
            httpServer,
            sourceEditing: true,
        });
        for (const route of devServer.routes) app.get(route.path, route.handler);
        app.use(devServer.viteServer.middlewares);
        httpServer.listen(0);
        await new Promise<void>((resolve) => httpServer.on('listening', resolve));
        const addr = httpServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 3000;
        url = `http://localhost:${port}`;
        (devServer as any)._httpServer = httpServer;
        browser = await chromium.launch();
    }, 40000);

    afterAll(async () => {
        await browser?.close();
        await new Promise<void>((resolve) => {
            (devServer as any)?._httpServer?.close(() => resolve());
        }).catch(() => {});
        await devServer?.viteServer?.close();
        clearServerElementCache();
        const buildDir = path.join(path.resolve(__dirname, DIR), 'build');
        fs.rmSync(buildDir, { recursive: true, force: true });
    });

    async function inspect(
        selector: string,
        kind: 'point' | 'rect' = 'point',
    ): Promise<InspectResult> {
        const page: Page = await browser.newPage();
        try {
            await page.goto(`${url}/?_jay_embed`, { waitUntil: 'networkidle' });
            await page.waitForSelector('[jay-dev-src]', { timeout: 10000 });
            await page.waitForTimeout(300); // let hydration settle
            return (await page.evaluate(
                async ({ selector, kind }) => {
                    const el = document.querySelector(selector);
                    if (!el)
                        return { node: null, stack: [], error: 'not found: ' + selector } as any;
                    const r = el.getBoundingClientRect();
                    const msg =
                        kind === 'rect'
                            ? {
                                  type: 'jay:inspectRect',
                                  requestId: 1,
                                  x: r.left,
                                  y: r.top,
                                  width: r.width,
                                  height: r.height,
                              }
                            : {
                                  type: 'jay:inspectPoint',
                                  requestId: 1,
                                  x: r.left + r.width / 2,
                                  y: r.top + r.height / 2,
                              };
                    return await new Promise((resolve) => {
                        const on = (e: MessageEvent) => {
                            if (e.data && e.data.type === 'jay:inspectResult') {
                                window.removeEventListener('message', on);
                                resolve(e.data);
                            }
                        };
                        window.addEventListener('message', on);
                        // standalone page: window.parent === window, so the reply lands here
                        window.postMessage(msg, '*');
                        setTimeout(
                            () => resolve({ node: null, stack: [], error: 'timeout' } as any),
                            3000,
                        );
                    });
                },
                { selector, kind },
            )) as InspectResult;
        } finally {
            await page.close();
        }
    }

    it('resolves authored text to its source line, no binding flag, no enclosing scopes', async () => {
        const r = await inspect('h1');
        expect(r.node?.tag).toBe('h1');
        expect(typeof r.node?.lines?.from).toBe('number');
        expect(r.node?.lines?.from).toBeGreaterThan(0);
        expect(r.node?.contentFromBinding).toBeUndefined();
        expect(r.stack).toHaveLength(0);
    }, 30000);

    it('reports the enclosing forEach frame with a record id', async () => {
        const r = await inspect('.card strong');
        expect(r.node?.tag).toBe('strong');
        const forEachFrame = r.stack.find((f) => f.kind === 'forEach');
        expect(forEachFrame).toBeDefined();
        expect(typeof forEachFrame?.itemId).toBe('string');
        expect(forEachFrame?.itemId?.length).toBeGreaterThan(0);
    }, 30000);

    it('reports the enclosing region frame with its contract name', async () => {
        const r = await inspect('.widget .label');
        const regionFrame = r.stack.find((f) => f.kind === 'region');
        expect(regionFrame).toBeDefined();
        expect(regionFrame?.name).toBe('widget');
        // nested inside the forEach too
        expect(r.stack.some((f) => f.kind === 'forEach')).toBe(true);
    }, 30000);

    it('inspectRect selects the enclosing element the box is drawn around', async () => {
        const r = await inspect('.card', 'rect');
        expect(r.node).not.toBeNull();
        expect(r.node?.rect).toBeDefined();
        expect(typeof r.node?.html).toBe('string');
    }, 30000);
});
