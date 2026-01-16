import { Connect, createServer, ViteDevServer } from 'vite';
import {
    JayRoute,
    JayRoutes,
    routeToExpressRoute,
    scanRoutes,
} from '@jay-framework/stack-route-scanner';
import {
    DevSlowlyChangingPhase,
    SlowlyChangingPhase,
    getClientInitData,
    preparePluginClientInits,
    type PluginWithInit,
    type PluginClientInitInfo,
} from '@jay-framework/stack-server-runtime';
import type {
    ClientError4xx,
    PageProps,
    Redirect3xx,
    ServerError5xx,
} from '@jay-framework/fullstack-component';
import { jayStackCompiler } from '@jay-framework/compiler-jay-stack';
import path from 'node:path';
import { RequestHandler } from 'express-serve-static-core';
import { renderFastChangingData } from '@jay-framework/stack-server-runtime';
import { loadPageParts } from '@jay-framework/stack-server-runtime';
import { generateClientScript, ProjectClientInitInfo } from '@jay-framework/stack-server-runtime';
import { Request, Response } from 'express';
import { DevServerOptions } from './dev-server-options';
import { ServiceLifecycleManager } from './service-lifecycle';
import { deepMergeViewStates } from '@jay-framework/view-state-merge';
import { createActionRouter, actionBodyParser, ACTION_ENDPOINT_BASE } from './action-router';

async function initRoutes(pagesBaseFolder: string): Promise<JayRoutes> {
    return await scanRoutes(pagesBaseFolder, {
        jayHtmlFilename: 'page.jay-html',
        compFilename: 'page.ts',
    });
}

function defaults(options: DevServerOptions): DevServerOptions {
    const publicBaseUrlPath = options.publicBaseUrlPath || process.env.BASE || '/';
    const projectRootFolder = options.projectRootFolder || '.';
    const pagesRootFolder = path.resolve(
        projectRootFolder,
        options.pagesRootFolder || './src/pages',
    );
    const tsConfigFilePath =
        options.jayRollupConfig.tsConfigFilePath ||
        path.resolve(projectRootFolder, './tsconfig.json');
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

/**
 * Filters plugins for a page, including transitive plugin dependencies.
 *
 * When a page uses wix-stores, we also need to include wix-server-client
 * (which wix-stores depends on) in the client init.
 */
function filterPluginsForPage(
    allPluginClientInits: PluginClientInitInfo[],
    allPluginsWithInit: PluginWithInit[],
    usedPackages: Set<string>,
): PluginClientInitInfo[] {
    // Build a map of package name -> plugin info for quick lookup
    const pluginsByPackage = new Map<string, PluginWithInit>();
    for (const plugin of allPluginsWithInit) {
        pluginsByPackage.set(plugin.packageName, plugin);
    }

    // Expand usedPackages to include transitive plugin dependencies
    const expandedPackages = new Set<string>(usedPackages);
    const toProcess = [...usedPackages];

    while (toProcess.length > 0) {
        const packageName = toProcess.pop()!;
        const plugin = pluginsByPackage.get(packageName);
        if (!plugin) continue;

        // Add this plugin's dependencies that are also plugins
        for (const dep of plugin.dependencies) {
            if (pluginsByPackage.has(dep) && !expandedPackages.has(dep)) {
                expandedPackages.add(dep);
                toProcess.push(dep);
            }
        }
    }

    // Filter plugin client inits to those in the expanded set
    return allPluginClientInits.filter((plugin) => {
        const pluginInfo = allPluginsWithInit.find((p) => p.name === plugin.name);
        return pluginInfo && expandedPackages.has(pluginInfo.packageName);
    });
}

function mkRoute(
    route: JayRoute,
    vite: ViteDevServer,
    slowlyPhase: SlowlyChangingPhase,
    options: DevServerOptions,
    projectInit?: ProjectClientInitInfo,
    allPluginsWithInit: PluginWithInit[] = [],
    allPluginClientInits: PluginClientInitInfo[] = [],
): DevServerRoute {
    const path = routeToExpressRoute(route);
    const handler = async (req: Request, res: Response) => {
        try {
            const url = req.originalUrl.replace(options.publicBaseUrlPath, '');
            // Merge Express params with inferred params from static override routes
            // Inferred params allow static routes like /products/ceramic-flower-vase
            // to provide { slug: 'ceramic-flower-vase' } based on sibling /products/[slug]
            const pageParams = { ...route.inferredParams, ...req.params };
            const pageProps: PageProps = {
                language: 'en',
                url,
            };

            let viewState: object, carryForward: object;
            const pagePartsResult = await loadPageParts(
                vite,
                route,
                options.pagesRootFolder,
                options.projectRootFolder,
                options.jayRollupConfig,
            );

            if (pagePartsResult.val) {
                const {
                    parts: pageParts,
                    serverTrackByMap,
                    clientTrackByMap,
                    usedPackages,
                } = pagePartsResult.val;

                // Filter plugins to only those used on this page (including transitive dependencies)
                const pluginsForPage = filterPluginsForPage(
                    allPluginClientInits,
                    allPluginsWithInit,
                    usedPackages,
                );

                const renderedSlowly = await slowlyPhase.runSlowlyForPage(
                    pageParams,
                    pageProps,
                    pageParts,
                );

                if (renderedSlowly.kind === 'PhaseOutput') {
                    const renderedFast = await renderFastChangingData(
                        pageParams,
                        pageProps,
                        renderedSlowly.carryForward,
                        pageParts,
                    );
                    if (renderedFast.kind === 'PhaseOutput') {
                        // Deep merge view states using trackBy metadata (server-side: slow + fast)
                        if (serverTrackByMap && Object.keys(serverTrackByMap).length > 0) {
                            viewState = deepMergeViewStates(
                                renderedSlowly.rendered,
                                renderedFast.rendered,
                                serverTrackByMap,
                            );
                        } else {
                            // Fallback to shallow merge if no trackBy info available
                            viewState = { ...renderedSlowly.rendered, ...renderedFast.rendered };
                        }
                        carryForward = renderedFast.carryForward;

                        // Pass clientTrackByMap to client (excludes fast+interactive arrays)
                        // Include static client init data (feature flags, config, etc.)
                        // Only include plugins that are actually used on this page
                        const pageHtml = generateClientScript(
                            viewState,
                            carryForward,
                            pageParts,
                            route.jayHtmlPath,
                            clientTrackByMap,
                            getClientInitData(),
                            projectInit,
                            pluginsForPage,
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
                console.log(pagePartsResult.validations.join('\n'));
                res.status(500).end(pagePartsResult.validations.join('\n'));
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
    const {
        publicBaseUrlPath,
        pagesRootFolder,
        projectRootFolder,
        jayRollupConfig,
        dontCacheSlowly,
    } = defaults(options);

    // Initialize service lifecycle manager
    const lifecycleManager = new ServiceLifecycleManager(projectRootFolder);

    // Set up graceful shutdown handlers
    setupGracefulShutdown(lifecycleManager);

    const vite = await createServer({
        server: { middlewareMode: true },
        plugins: [...jayStackCompiler(jayRollupConfig)],
        appType: 'custom',
        base: publicBaseUrlPath,
        root: pagesRootFolder,
        ssr: {
            // Mark stack-server-runtime as external so Vite uses Node's require
            // This ensures lib/init.ts and dev-server share the same module instance
            external: ['@jay-framework/stack-server-runtime'],
        },
    });

    // Set the Vite server and initialize services
    lifecycleManager.setViteServer(vite);
    await lifecycleManager.initialize();

    // Set up hot reload for lib/init.ts
    setupServiceHotReload(vite, lifecycleManager);

    // Set up action router for /_jay/actions/* endpoints
    setupActionRouter(vite);

    const routes: JayRoutes = await initRoutes(pagesRootFolder);
    const slowlyPhase = new DevSlowlyChangingPhase(dontCacheSlowly);

    // Get init info for embedding in generated pages
    const projectInit = lifecycleManager.getProjectInit() ?? undefined;
    const pluginsWithInit = lifecycleManager.getPluginsWithInit();
    const pluginClientInits = preparePluginClientInits(pluginsWithInit);

    const devServerRoutes: DevServerRoute[] = routes.map((route: JayRoute) =>
        mkRoute(route, vite, slowlyPhase, options, projectInit, pluginsWithInit, pluginClientInits),
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
 * Sets up hot reload for lib/init.ts file changes
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
            console.log('[Services] lib/init.ts changed, reloading services...');
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

/**
 * Sets up the action router for handling /_jay/actions/* requests.
 * Actions are RPC-style endpoints that can be called from the client.
 */
function setupActionRouter(vite: ViteDevServer): void {
    // Add body parser middleware for action requests
    vite.middlewares.use(actionBodyParser());

    // Add action router
    vite.middlewares.use(ACTION_ENDPOINT_BASE, createActionRouter());

    console.log(`[Actions] Action router mounted at ${ACTION_ENDPOINT_BASE}`);
}
