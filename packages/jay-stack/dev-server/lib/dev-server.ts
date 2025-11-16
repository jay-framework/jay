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
import { ServiceLifecycleManager } from './service-lifecycle';

async function initRoutes(pagesBaseFolder: string): Promise<JayRoutes> {
    return await scanRoutes(pagesBaseFolder, {
        jayHtmlFilename: 'page.jay-html',
        compFilename: 'page.ts',
    });
}

function defaults(options: DevServerOptions): DevServerOptions {
    const publicBaseUrlPath = options.publicBaseUrlPath || process.env.BASE || '/';
    const projectRootFolder = options.projectRootFolder || '.';
    const pagesRootFolder = path.resolve(projectRootFolder, options.pagesRootFolder || './src/pages');
    const tsConfigFilePath =
        options.jayRollupConfig.tsConfigFilePath || path.resolve(projectRootFolder, './tsconfig.json');
    return {
        publicBaseUrlPath,
        pagesRootFolder,
        projectRootFolder,
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
    lifecycleManager: ServiceLifecycleManager;
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
            const url = req.originalUrl.replace(options.publicBaseUrlPath, '');
            const pageParams = req.params;
            const pageProps: PageProps = {
                language: 'en',
                url,
            };

            let viewState: object, carryForward: object;
            const pageParts = await loadPageParts(
                vite,
                route,
                options.pagesRootFolder,
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
    const { publicBaseUrlPath, pagesRootFolder, projectRootFolder, jayRollupConfig, dontCacheSlowly } = defaults(options);

    // Initialize service lifecycle manager
    const lifecycleManager = new ServiceLifecycleManager(projectRootFolder);

    // Set up graceful shutdown handlers
    setupGracefulShutdown(lifecycleManager);

    const vite = await createServer({
        server: { middlewareMode: true },
        plugins: [jayRuntime(jayRollupConfig)],
        appType: 'custom',
        base: publicBaseUrlPath,
        root: pagesRootFolder,
        ssr: {
            // Mark stack-server-runtime as external so Vite uses Node's require
            // This ensures jay.init.ts and dev-server share the same module instance
            external: ['@jay-framework/stack-server-runtime'],
        },
    });

    // Set the Vite server and initialize services
    lifecycleManager.setViteServer(vite);
    await lifecycleManager.initialize();

    // Set up hot reload for jay.init.ts
    setupServiceHotReload(vite, lifecycleManager);

    const routes: JayRoutes = await initRoutes(pagesRootFolder);
    const slowlyPhase = new DevSlowlyChangingPhase(dontCacheSlowly);

    const devServerRoutes: DevServerRoute[] = routes.map((route: JayRoute) =>
        mkRoute(route, vite, slowlyPhase, options),
    );

    return {
        server: vite.middlewares,
        viteServer: vite,
        routes: devServerRoutes,
        lifecycleManager,
    };
}

/**
 * Sets up graceful shutdown handlers for SIGTERM and SIGINT
 */
function setupGracefulShutdown(lifecycleManager: ServiceLifecycleManager): void {
    const shutdown = async (signal: string) => {
        console.log(`\n${signal} received, shutting down gracefully...`);
        await lifecycleManager.shutdown();
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Sets up hot reload for jay.init.ts file changes
 */
function setupServiceHotReload(
    vite: ViteDevServer,
    lifecycleManager: ServiceLifecycleManager,
): void {
    const initFilePath = lifecycleManager.getInitFilePath();
    if (!initFilePath) {
        return; // No init file to watch
    }

    // Watch the init file for changes
    vite.watcher.add(initFilePath);

    vite.watcher.on('change', async (changedPath) => {
        if (changedPath === initFilePath) {
            console.log('[Services] jay.init.ts changed, reloading services...');
            try {
                await lifecycleManager.reload();
                // Trigger browser reload
                vite.ws.send({
                    type: 'full-reload',
                    path: '*',
                });
            } catch (error) {
                console.error('[Services] Failed to reload services:', error);
            }
        }
    });
}
