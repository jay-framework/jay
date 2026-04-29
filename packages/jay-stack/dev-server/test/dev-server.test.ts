import { DevServerOptions, mkDevServer } from '../lib';
import { JayRollupConfig } from '@jay-framework/vite-plugin';
import path from 'path';
import http from 'node:http';
import { Request, Response } from 'express';
import { runHydrateScriptInJsdom } from './run-script-in-jsdom';

// this statement is required to tell vitest to load the right encodeUTF8("") instanceof Uint8Array
// @see https://github.com/vitest-dev/vitest/issues/4043
// @vitest-environment node

describe('dev server', () => {
    const baseOptions = {
        serverBase: '/',
        pagesBase: path.resolve(__dirname, './'),
        projectRootFolder: path.resolve(__dirname, './'),
        jayRollupConfig: {
            tsConfigFilePath: path.resolve(__dirname, '../../../tsconfig.json'),
        } as JayRollupConfig,
    };

    function optionsForDir(directory: string, httpServer?: http.Server): DevServerOptions {
        return {
            ...baseOptions,
            pagesRootFolder: path.resolve(__dirname, directory),
            projectRootFolder: path.resolve(__dirname, directory),
            httpServer,
        };
    }

    it('should handle a simple jay-html file without code', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer(optionsForDir('./simple-page', httpServer));
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');

        const [html] = await makeRequest(devServer.routes[0].handler, '/');
        const [script] = await makeRequest(
            devServer.server,
            '/@id/__x00__/index.html?html-proxy&index=0.js',
        );
        await devServer.viteServer.close();

        expect(html).toEqual(`<!doctype html>
<html lang="en">
  <head>
    <script type="module" src="/@vite/client"></script>

    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + TS</title>
  </head>
  <body>
    <div id="target"><div jay-coordinate="S0/0"><h1>Hello World</h1><p>This is a simple page without any code file</p></div></div>
    <script type="module" src="/@id/__x00__/index.html?html-proxy&index=0.js"></script>
  </body>
</html>`);

        const scriptForMatching = clearScriptForTest(script);

        expect(scriptForMatching).toEqual(`
import {hydrateCompositeJayComponent} from "@jay-framework/stack-client-runtime";
import { wrapWithAutomation, AUTOMATION_CONTEXT } from "@jay-framework/runtime-automation";
import { registerGlobalContext } from "@jay-framework/runtime";


import { hydrate } from "/page.jay-html?import&jay-hydrate.ts";

const viewState = {};
const fastCarryForward = {};
const trackByMap = {};

const target = document.getElementById('target');
const rootElement = target.firstElementChild;
const pageComp = hydrateCompositeJayComponent(hydrate, viewState, fastCarryForward, [], trackByMap, rootElement);

const instance = pageComp({/* placeholder for page props */});

// Wrap with automation for dev tooling
const wrapped = wrapWithAutomation(instance);
registerGlobalContext(AUTOMATION_CONTEXT, wrapped.automation);
window.__jay = window.__jay || {};
window.__jay.automation = wrapped.automation;
window.dispatchEvent(new Event('jay:automation-ready'));

// source-map`);
    });

    it('should run simple-page hydration script in jsdom', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer(optionsForDir('./simple-page', httpServer));
        const [html] = await makeRequest(devServer.routes[0].handler, '/');
        const [script] = await makeRequest(
            devServer.server,
            '/@id/__x00__/index.html?html-proxy&index=0.js',
        );

        const { instance, document } = await runHydrateScriptInJsdom(
            html,
            script,
            devServer.viteServer,
            path.resolve(__dirname, 'simple-page'),
        );

        await devServer.viteServer.close();

        expect(instance).toBeDefined();
        const target = document.getElementById('target');
        expect(target).toBeTruthy();
        expect(target!.innerHTML).toContain('Hello World');
        expect(target!.innerHTML).toContain('This is a simple page without any code file');
    });

    it('should handle a jay-html file with code', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer(optionsForDir('./page-with-code', httpServer));
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');

        const [html, headers] = await makeRequest(devServer.routes[0].handler, '/');
        const [script] = await makeRequest(
            devServer.server,
            '/@id/__x00__/index.html?html-proxy&index=0.js',
        );
        await devServer.viteServer.close();

        // SSR falls back to client-only rendering for pages with {{}} syntax
        // (jay-html uses single-brace {expr} syntax; this test page uses {{}} which is invalid for SSR)
        expect(html).toEqual(`<!doctype html>
<html lang="en">
  <head>
    <script type="module" src="/@vite/client"></script>

    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + TS</title>
  </head>
  <body>
    <div id="target"></div>
    <script type="module" src="/@id/__x00__/index.html?html-proxy&index=0.js"></script>
  </body>
</html>`);

        const scriptForMatching = clearScriptForTest(script);

        expect(scriptForMatching).toEqual(`
import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
import { wrapWithAutomation, AUTOMATION_CONTEXT } from "@jay-framework/runtime-automation";
import { registerGlobalContext } from "@jay-framework/runtime";
import { deepMergeViewStates } from "@jay-framework/view-state-merge";


import { render } from "/page.jay-html.ts";
import {page} from "/page.ts"
const slowViewState = {"title":"Page with Code","content":"This page has both a jay-html file and a code file"};
const viewState = {};

const fastCarryForward = {};
const trackByMap = {};

const target = document.getElementById('target');
const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [
{comp: page.comp, contextMarkers: page.contexts || []}
], trackByMap)

const instance = pageComp({/* placeholder for page props */})

// Wrap with automation for dev tooling
// Deep merge slow+fast ViewState so automation can see full page state
const fullViewState = deepMergeViewStates(slowViewState, {...viewState, ...fastCarryForward}, trackByMap);
const wrapped = wrapWithAutomation(instance, { initialViewState: fullViewState, trackByMap });
registerGlobalContext(AUTOMATION_CONTEXT, wrapped.automation);
window.__jay = window.__jay || {};
window.__jay.automation = wrapped.automation;
window.dispatchEvent(new Event('jay:automation-ready'));
target.appendChild(wrapped.element.dom);

// source-map`);
    });

    it('should handle a jay-html file with headless component', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer(
            optionsForDir('./6a-page-with-keyed-headless', httpServer),
        );
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');

        const [html, headers] = await makeRequest(devServer.routes[0].handler, '/');
        const [script] = await makeRequest(
            devServer.server,
            '/@id/__x00__/index.html?html-proxy&index=0.js',
        );
        await devServer.viteServer.close();

        // SSR renders the page with pre-rendered content
        expect(html).toBeDefined();
        expect(headers).toBeDefined();
        // Verify the page has SSR content (not empty target div)
        const target = html.match(/<div id="target">([\s\S]*?)<\/div>\s*\n?\s*<script/);
        expect(target).toBeTruthy();
        expect(target![1]).toBeTruthy(); // has content inside target div

        // SSR mode: script is hydration script (not client-only)
        // Verify key structural elements of the hydration script
        const scriptForMatching = clearScriptForTest(script);
        expect(scriptForMatching).toBeDefined();
        // Should import hydration composite component
        expect(script).toMatch(/hydrateCompositeJayComponent/);
        // Should import the page component and headless component
        expect(script).toMatch(/page\.ts/);
        expect(script).toMatch(/headless-component\.ts/);
        // Should have viewState with headless data
        expect(script).toMatch(/headless/);
        // Should have automation setup
        expect(script).toMatch(/automation/);
    }, 5000000);
});

describe('DevServerService', () => {
    const baseOptions = {
        serverBase: '/',
        pagesBase: path.resolve(__dirname, './'),
        projectRootFolder: path.resolve(__dirname, './'),
        jayRollupConfig: {
            tsConfigFilePath: path.resolve(__dirname, '../../../tsconfig.json'),
        },
    };

    it('listRoutes returns all routes', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer({
            ...baseOptions,
            pagesRootFolder: path.resolve(__dirname, './simple-page'),
            projectRootFolder: path.resolve(__dirname, './simple-page'),
            httpServer,
        });

        const routes = devServer.service.listRoutes();
        expect(routes).toHaveLength(1);
        expect(routes[0].path).toBe('/');
        expect(routes[0].jayHtmlPath).toBeDefined();
        expect(routes[0].compPath).toBeDefined();

        await devServer.viteServer.close();
    });

    it('loadRouteParams returns empty for route without loadParams', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer({
            ...baseOptions,
            pagesRootFolder: path.resolve(__dirname, './simple-page'),
            projectRootFolder: path.resolve(__dirname, './simple-page'),
            httpServer,
        });

        const batches: any[] = [];
        for await (const batch of devServer.service.loadRouteParams('/')) {
            batches.push(batch);
        }

        expect(batches).toHaveLength(0);

        await devServer.viteServer.close();
    });

    it('loadRouteParams yields param batches for route with loadParams', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer({
            ...baseOptions,
            pagesRootFolder: path.resolve(__dirname, './page-with-params'),
            projectRootFolder: path.resolve(__dirname, './page-with-params'),
            httpServer,
        });

        const batches: any[] = [];
        for await (const batch of devServer.service.loadRouteParams('/')) {
            batches.push(batch);
        }

        // Generator yields 2 batches
        expect(batches).toHaveLength(2);

        // First batch: [{ slug: 'item-a' }, { slug: 'item-b' }]
        expect(batches[0]).toHaveLength(2);
        expect(batches[0][0].slug).toBe('item-a');
        expect(batches[0][1].slug).toBe('item-b');

        // Second batch: [{ slug: 'item-c' }]
        expect(batches[1]).toHaveLength(1);
        expect(batches[1][0].slug).toBe('item-c');

        await devServer.viteServer.close();
    });

    it('loadRouteParams throws for unknown route', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer({
            ...baseOptions,
            pagesRootFolder: path.resolve(__dirname, './simple-page'),
            projectRootFolder: path.resolve(__dirname, './simple-page'),
            httpServer,
        });

        await expect(async () => {
            for await (const _ of devServer.service.loadRouteParams('/nonexistent')) {
                // should not reach here
            }
        }).rejects.toThrow('Route "/nonexistent" not found');

        await devServer.viteServer.close();
    });
});

function clearScriptForTest(script: string) {
    const cmd = process.cwd();
    return (
        script
            // Strip Vite HMR preamble (added by Vite to inline HTML scripts)
            .replace(
                /import \{ createHotContext as __vite__createHotContext \} from ".*?";import\.meta\.hot = __vite__createHotContext\(".*?"\);/,
                '',
            )
            .replace(cmd, '')
            .replace(/\/\/\#.*/, '// source-map')
            .replace(
                /from "(\/@fs\/.*?stack-client-runtime.*?)"/g,
                'from "@jay-framework/stack-client-runtime"',
            )
            .replace(
                /from "(\/@fs\/.*?runtime-automation.*?)"/g,
                'from "@jay-framework/runtime-automation"',
            )
            .replace(/from "(\/@fs\/.*?runtime\/dist.*?)"/g, 'from "@jay-framework/runtime"')
            .replace(
                /from "(\/@fs\/.*?view-state-merge.*?)"/g,
                'from "@jay-framework/view-state-merge"',
            )
            .replace(/\/build\/pre-rendered\/[^/]*\//g, '/')
            .split('\n')
            .map((line) => line.trim())
            .join('\n')
            // Strip the freeze shortcut script (DL#128) — it's an implementation detail
            .replace(/\n\/\/ Page Freeze[\s\S]*?\n\/\/ source-map/, '\n// source-map')
    );
}

async function makeRequest(handler: any, path: string): Promise<[string, Record<string, string>]> {
    return new Promise((resolve, reject) => {
        const req = {
            method: 'GET',
            originalUrl: path,
            params: {},
            url: path,
            headers: {},
            pipe: () => req,
            on: () => req,
            once: () => req,
            listeners: () => [],
            removeListener: () => req,
            removeAllListeners: () => req,
            emit: () => true,
            readable: true,
            read: () => null,
            unpipe: () => req,
            resume: () => req,
            pause: () => req,
        } as unknown as Request;

        const resHeaders = {};
        const res = {
            status: (code: number) => res,
            set: (headers: any) => res,
            send: (data: string) => {
                resolve([data, resHeaders]);
                return res;
            },
            end: (data: string) => {
                resolve([data, resHeaders]);
                return res;
            },
            setHeader: (key: string, value: string) => {
                resHeaders[key] = value;
            },
            pipe: () => res,
            on: () => res,
            once: () => res,
            listeners: () => [],
            removeListener: () => res,
            removeAllListeners: () => res,
            emit: () => true,
            writable: true,
            write: () => true,
            cork: () => {},
            uncork: () => {},
        } as unknown as Response;

        handler(req, res);
    });
}
