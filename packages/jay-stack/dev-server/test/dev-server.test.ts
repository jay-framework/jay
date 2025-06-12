import { DevServerOptions, mkDevServer } from '../lib';
import { JayRollupConfig } from 'vite-plugin-jay';
import path from 'path';
import { Request, Response } from 'express';

// this statement is required to tell vitest to load the right encodeUTF8("") instanceof Uint8Array
// @see https://github.com/vitest-dev/vitest/issues/4043
// @vitest-environment node

describe('dev server', () => {
    const baseOptions = {
        serverBase: '/',
        pagesBase: path.resolve(__dirname, './'),
        jayRollupConfig: {
            tsConfigFilePath: path.resolve(__dirname, '../../../tsconfig.json'),
        } as JayRollupConfig,
        dontCacheSlowly: true,
    };

    function optionsForDir(directory: string): DevServerOptions {
        return {
            ...baseOptions,
            pagesBase: path.resolve(__dirname, directory),
        };
    }

    it('should handle a simple jay-html file without code', async () => {
        const devServer = await mkDevServer(optionsForDir('./simple-page'));
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
    <div id="target"></div>
    <script type="module" src="/@id/__x00__/index.html?html-proxy&index=0.js"></script>
  </body>
</html>`);

        const scriptForMatching = clearScriptForTest(script);

        expect(scriptForMatching).toEqual(`
import {makeCompositeJayComponent} from "jay-stack-client-runtime";
import { render } from "/page.jay-html.ts";

const viewState = {};
const fastCarryForward = {};

const target = document.getElementById('target');
const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [])

const instance = pageComp({...viewState, ...fastCarryForward})
target.appendChild(instance.element.dom);

// source-map`);
    });

    it('should handle a jay-html file with code', async () => {
        const devServer = await mkDevServer(optionsForDir('./page-with-code'));
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');

        const [html, headers] = await makeRequest(devServer.routes[0].handler, '/');
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
    <div id="target"></div>
    <script type="module" src="/@id/__x00__/index.html?html-proxy&index=0.js"></script>
  </body>
</html>`);

        const scriptForMatching = clearScriptForTest(script);

        expect(scriptForMatching).toEqual(`
import {makeCompositeJayComponent} from "jay-stack-client-runtime";
import { render } from "/page.jay-html.ts";

const viewState = {"title":"Page with Code","content":"This page has both a jay-html file and a code file"};
const fastCarryForward = {};

const target = document.getElementById('target');
const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [])

const instance = pageComp({...viewState, ...fastCarryForward})
target.appendChild(instance.element.dom);

// source-map`);
    });

    it('should handle a jay-html file with headless component', async () => {
        const devServer = await mkDevServer(optionsForDir('./page-with-headless'));
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');

        const [html, headers] = await makeRequest(devServer.routes[0].handler, '/');
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
    <div id="target"></div>
    <script type="module" src="/@id/__x00__/index.html?html-proxy&index=0.js"></script>
  </body>
</html>`);

        const scriptForMatching = clearScriptForTest(script);

        expect(scriptForMatching).toEqual(`
import {makeCompositeJayComponent} from "jay-stack-client-runtime";
import { render } from "/page.jay-html.ts";
import {page} from "/page.ts"
import {headless} from "/headless-component.ts"

const viewState = {"title":"Page with Headless","content":"This page has a headless component","headless":{"content":"This is from the headless component"}};
const fastCarryForward = {};

const target = document.getElementById('target');
const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [
{comp: page.comp, contextMarkers: []},
{comp: headless.comp, contextMarkers: [], key: 'headless'}
])

const instance = pageComp({...viewState, ...fastCarryForward})
target.appendChild(instance.element.dom);

// source-map`);
    }, 5000000);
});

function clearScriptForTest(script: string) {
    const cmd = process.cwd();
    return script
        .replace(cmd, '')
        .replace(/\/\/\#.*/, '// source-map')
        .replace(/from "(\/@fs\/.*?stack-client-runtime.*?)"/g, 'from "jay-stack-client-runtime"')
        .split('\n')
        .map((line) => line.trim())
        .join('\n');
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
