import {DevServerOptions, mkDevServer} from '../../lib';
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
            tsConfigFilePath: path.resolve(__dirname, '../../../tsconfig.json')
        } as JayRollupConfig,
        dontCacheSlowly: true
    };

    function optionsForDir(directory: string): DevServerOptions {
        return {
            ...baseOptions,
            pagesBase: path.resolve(__dirname, directory)
        }
    }

    async function makeRequest(handler: any, path: string): Promise<[string, Record<string, string>]> {

        return new Promise((resolve, reject) => {
            const req = {
                originalUrl: path,
                params: {},
                url: path,
                headers: {}
            } as Request;

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
                }
            } as Response;

            handler(req, res);
        });
    }

    it('should handle a simple jay-html file without code', async () => {
        const devServer = await mkDevServer(optionsForDir('./simple-page'))
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');

        const [html, headers] = await makeRequest(devServer.routes[0].handler, '/');
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

        const [script, scriptHeaders] = await makeRequest(devServer.server, '/@id/__x00__/index.html?html-proxy&index=0.js');

        expect(script).toEqual(`<!doctype html>`)


        await devServer.viteServer.close();
    });

    it('should handle a jay-html file with code', async () => {
        const devServer = await mkDevServer(optionsForDir('./page-with-code'))
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');

        const [html, headers] = await makeRequest(devServer.routes[0].handler, '/');
        expect(html).toContain('Page with Code');
        expect(html).toContain('This page has both a jay-html file and a code file');
        expect(html).toContain('<!doctype html>');

        await devServer.viteServer.close();
    });

    it('should handle a jay-html file with headless component', async () => {
        const devServer = await mkDevServer(optionsForDir('./page-with-headless'))
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');

        const [html, headers] = await makeRequest(devServer.routes[0].handler, '/');
        expect(html).toContain('Page with Headless');
        expect(html).toContain('This page has a headless component');
        expect(html).toContain('This is from the headless component');
        expect(html).toContain('<!doctype html>');

        await devServer.viteServer.close();
    });
}); 