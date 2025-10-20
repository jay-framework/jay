import { Connect, createServer, ViteDevServer } from 'vite';
import {
    JayRoute,
    JayRoutes,
    routeToExpressRoute,
    scanRoutes,
} from '@jay-framework/stack-route-scanner';
import { DevSlowlyChangingPhase, SlowlyChangingPhase } from '@jay-framework/stack-server-runtime';
import type {
    ClientError4xx,
    PageProps,
    Redirect3xx,
    ServerError5xx,
} from '@jay-framework/fullstack-component';
import { jayRuntime } from '@jay-framework/vite-plugin';
import path from 'node:path';
import { RequestHandler } from 'express-serve-static-core';
import { renderFastChangingData } from '@jay-framework/stack-server-runtime';
import { loadPageParts } from '@jay-framework/stack-server-runtime';
import { generateClientScript } from '@jay-framework/stack-server-runtime';
import { Request, Response } from 'express';
import { DevServerOptions } from './dev-server-options';

async function initRoutes(pagesBaseFolder: string): Promise<JayRoutes> {
    return await scanRoutes(pagesBaseFolder, {
        jayHtmlFilename: 'page.jay-html',
        compFilename: 'page.ts',
    });
}

function defaults(options: DevServerOptions): DevServerOptions {
    const serverBase = options.serverBase || process.env.BASE || '/';
    const pagesBase = path.resolve(serverBase, options.pagesBase || './src/pages');
    const tsConfigFilePath =
        options.jayRollupConfig.tsConfigFilePath || path.resolve(serverBase, './tsconfig.json');
    return {
        serverBase,
        pagesBase,
        dontCacheSlowly: options.dontCacheSlowly,
        jayRollupConfig: {
            ...(options.jayRollupConfig || {}),
            tsConfigFilePath,
        },
    };
}

export interface DevServerRoute {
    path: string;
    handler: RequestHandler;
    fsRoute: JayRoute;
}

export interface DevServer {
    server: Connect.Server;
    viteServer: ViteDevServer;
    routes: DevServerRoute[];
}

function handleOtherResponseCodes(
    res: Response,
    renderedResult: ServerError5xx | ClientError4xx | Redirect3xx,
) {
    if (renderedResult.kind === `ServerError`)
        res.status(renderedResult.status).end('server error');
    else if (renderedResult.kind === `ClientError`)
        res.status(renderedResult.status).end('client error');
    else res.status(renderedResult.status).end('redirect to ' + renderedResult.location);
}

function mkRoute(
    route: JayRoute,
    vite: ViteDevServer,
    slowlyPhase: SlowlyChangingPhase,
    options: DevServerOptions,
): DevServerRoute {
    const path = routeToExpressRoute(route);
    const handler = async (req: Request, res: Response) => {
        try {
            const url = req.originalUrl.replace(options.serverBase, '');
            const pageParams = req.params;
            const pageProps: PageProps = {
                language: 'en',
                url,
            };

            let viewState: object, carryForward: object;
            const pageParts = await loadPageParts(
                vite,
                route,
                options.pagesBase,
                options.jayRollupConfig,
            );

            if (pageParts.val) {
                const renderedSlowly = await slowlyPhase.runSlowlyForPage(
                    pageParams,
                    pageProps,
                    pageParts.val,
                );

                if (renderedSlowly.kind === 'PartialRender') {
                    const renderedFast = await renderFastChangingData(
                        pageParams,
                        pageProps,
                        renderedSlowly.carryForward,
                        pageParts.val,
                    );
                    if (renderedFast.kind === 'PartialRender') {
                        viewState = { ...renderedSlowly.rendered, ...renderedFast.rendered };
                        carryForward = renderedFast.carryForward;

                        const pageHtml = generateClientScript(
                            viewState,
                            carryForward,
                            pageParts.val,
                            route.jayHtmlPath,
                        );

                        console.log(`[route] html \n${pageHtml}`)

                        const compiledPageHtml = await vite.transformIndexHtml(
                            !!url ? url : '/',
                            pageHtml,
                        );
                        res.status(200).set({ 'Content-Type': 'text/html' }).send(compiledPageHtml);
                    } else {
                        handleOtherResponseCodes(res, renderedFast);
                    }
                } else if (renderedSlowly.kind === 'ClientError') {
                    handleOtherResponseCodes(res, renderedSlowly);
                }
            } else {
                console.log(pageParts.validations.join('\n'));
                res.status(500).end(pageParts.validations.join('\n'));
            }
        } catch (e) {
            vite?.ssrFixStacktrace(e);
            console.log(e.stack);
            res.status(500).end(e.stack);
        }
    };
    return { path, handler, fsRoute: route };
}

export async function mkDevServer(options: DevServerOptions): Promise<DevServer> {
    const { serverBase, pagesBase, jayRollupConfig, dontCacheSlowly } = defaults(options);
    const vite = await createServer({
        server: { middlewareMode: true },
        plugins: [jayRuntime(jayRollupConfig)],
        appType: 'custom',
        base: serverBase,
        root: pagesBase,
    });

    const routes: JayRoutes = await initRoutes(pagesBase);
    const slowlyPhase = new DevSlowlyChangingPhase(dontCacheSlowly);

    const devServerRoutes: DevServerRoute[] = routes.map((route: JayRoute) =>
        mkRoute(route, vite, slowlyPhase, options),
    );

    return {
        server: vite.middlewares,
        viteServer: vite,
        routes: devServerRoutes,
    };
}
