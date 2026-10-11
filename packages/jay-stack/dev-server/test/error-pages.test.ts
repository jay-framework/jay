import { DevServerOptions, mkDevServer } from '../lib';
import { JayRollupConfig } from '@jay-framework/vite-plugin';
import path from 'path';
import http from 'node:http';
import { Request, Response } from 'express';

// @vitest-environment node

/**
 * DL#218 — dev-server error pages. The reserved top-level `404/` and `5xx/` folders are not
 * navigable routes; `errorPageHandler(status)` compiles the resolved error page on the fly and
 * injects the `error` ViewState (exact → family → plain text).
 */
describe('dev server error pages (DL#218)', () => {
    function optionsForDir(directory: string, httpServer?: http.Server): DevServerOptions {
        return {
            serverBase: '/',
            pagesRootFolder: path.resolve(__dirname, directory),
            projectRootFolder: path.resolve(__dirname, directory),
            jayRollupConfig: {
                tsConfigFilePath: path.resolve(__dirname, '../../../tsconfig.json'),
            } as JayRollupConfig,
            httpServer,
        } as DevServerOptions;
    }

    it('does not register reserved status folders as navigable routes', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer(optionsForDir('./error-pages', httpServer));
        try {
            const paths = devServer.routes.map((r) => r.path);
            expect(paths).toContain('/');
            expect(paths).not.toContain('/404');
            expect(paths).not.toContain('/5xx');
        } finally {
            await devServer.viteServer.close();
        }
    });

    it('renders the branded 404 page with status 404 for an unmatched path', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer(optionsForDir('./error-pages', httpServer));
        try {
            const { status, body } = await invoke(
                devServer.errorPageHandler(404),
                '/this-page-does-not-exist',
            );
            expect(status).toBe(404);
            expect(body).toMatch(/404 — Page Not Found/);
            expect(body).toMatch(/could not be found/);
            expect(body).toMatch(/<title>Page Not Found<\/title>/);
        } finally {
            await devServer.viteServer.close();
        }
    });

    it('falls back from an exact status to the 5xx family page', async () => {
        const httpServer = http.createServer();
        const devServer = await mkDevServer(optionsForDir('./error-pages', httpServer));
        try {
            const { status, body } = await invoke(devServer.errorPageHandler(503), '/boom');
            expect(status).toBe(503);
            expect(body).toMatch(/503 — Service Unavailable/);
        } finally {
            await devServer.viteServer.close();
        }
    });
});

/** Drive an Express handler with a mock req/res, capturing the final status and body. */
function invoke(
    handler: (req: Request, res: Response, next: () => void) => unknown,
    urlPath: string,
): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = {
            method: 'GET',
            originalUrl: urlPath,
            url: urlPath,
            path: urlPath,
            params: {},
            headers: { host: 'localhost' },
        } as unknown as Request;

        let statusCode = 200;
        const finish = (body: string) => resolve({ status: statusCode, body });
        const res = {
            statusCode,
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            type: () => res,
            set: () => res,
            setHeader: () => res,
            getHeader: () => undefined,
            send: (data: string) => {
                finish(data ?? '');
                return res;
            },
            end: (data?: string) => {
                finish(data ?? '');
                return res;
            },
            get headersSent() {
                return false;
            },
        } as unknown as Response;

        try {
            void handler(req, res, () => reject(new Error('unexpected next()')));
        } catch (err) {
            reject(err);
        }
    });
}
