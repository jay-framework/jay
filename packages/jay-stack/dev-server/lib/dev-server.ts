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
    SlowRenderCache,
} from '@jay-framework/stack-server-runtime';
import type {
    ClientError4xx,
    PageProps,
    Redirect3xx,
    ServerError5xx,
} from '@jay-framework/fullstack-component';
import { jayStackCompiler } from '@jay-framework/compiler-jay-stack';
import path from 'node:path';
import fs from 'node:fs/promises';
import { RequestHandler } from 'express-serve-static-core';
import { renderFastChangingData } from '@jay-framework/stack-server-runtime';
import { loadPageParts } from '@jay-framework/stack-server-runtime';
import { generateClientScript, ProjectClientInitInfo } from '@jay-framework/stack-server-runtime';
import { Request, Response } from 'express';
import { DevServerOptions } from './dev-server-options';
import { ServiceLifecycleManager } from './service-lifecycle';
import { deepMergeViewStates } from '@jay-framework/view-state-merge';
import { createActionRouter, actionBodyParser, ACTION_ENDPOINT_BASE } from './action-router';
import { slowRenderTransform, parseContract } from '@jay-framework/compiler-jay-html';

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
    const buildFolder = options.buildFolder || path.resolve(projectRootFolder, './build');
    const tsConfigFilePath =
        options.jayRollupConfig.tsConfigFilePath ||
        path.resolve(projectRootFolder, './tsconfig.json');
    return {
        publicBaseUrlPath,
        pagesRootFolder,
        projectRootFolder,
        buildFolder,
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
    slowRenderCache: SlowRenderCache,
    projectInit?: ProjectClientInitInfo,
    allPluginsWithInit: PluginWithInit[] = [],
    allPluginClientInits: PluginClientInitInfo[] = [],
): DevServerRoute {
    const routePath = routeToExpressRoute(route);
    const handler = async (req: Request, res: Response) => {
        try {
            const url = req.originalUrl.replace(options.publicBaseUrlPath, '');
            // Merge Express params with inferred params from static override routes
            // Inferred params allow static routes like /products/ceramic-flower-vase
            // to provide { slug: 'ceramic-flower-vase' } based on sibling /products/[slug]
            const pageParams = { ...route.inferredParams, ...req.params } as Record<string, string>;
            const pageProps: PageProps = {
                language: 'en',
                url,
            };

            // Check if slow render caching is enabled
            const useSlowRenderCache = !options.dontCacheSlowly;
            
            // Check if we have a cached pre-rendered jay-html
            const cachedEntry = useSlowRenderCache 
                ? slowRenderCache.get(route.jayHtmlPath, pageParams) 
                : undefined;

            if (cachedEntry) {
                // Cache hit: use cached pre-rendered jay-html and carryForward
                // No need to run slow rendering - everything is cached
                await handleCachedRequest(
                    vite, route, options, cachedEntry, pageParams, pageProps,
                    allPluginClientInits, allPluginsWithInit, projectInit,
                    res, url,
                );
            } else if (useSlowRenderCache) {
                // Cache miss with caching enabled: pre-render and cache
                await handlePreRenderRequest(
                    vite, route, options, slowlyPhase, slowRenderCache,
                    pageParams, pageProps, allPluginClientInits, allPluginsWithInit,
                    projectInit, res, url,
                );
            } else {
                // Caching disabled: run slow render on each request, full viewState to client
                await handleDirectRequest(
                    vite, route, options, slowlyPhase,
                    pageParams, pageProps, allPluginClientInits, allPluginsWithInit,
                    projectInit, res, url,
                );
            }
        } catch (e) {
            vite?.ssrFixStacktrace(e);
            console.log(e.stack);
            res.status(500).end(e.stack);
        }
    };
    return { path: routePath, handler, fsRoute: route };
}

/**
 * Handle request with cached pre-rendered jay-html.
 * Skips slow rendering entirely since both jay-html and carryForward are cached.
 */
async function handleCachedRequest(
    vite: ViteDevServer,
    route: JayRoute,
    options: DevServerOptions,
    cachedEntry: ReturnType<SlowRenderCache['get']> & object,
    pageParams: Record<string, string>,
    pageProps: PageProps,
    allPluginClientInits: PluginClientInitInfo[],
    allPluginsWithInit: PluginWithInit[],
    projectInit: ProjectClientInitInfo | undefined,
    res: Response,
    url: string,
): Promise<void> {
    // Load page parts with cached pre-rendered jay-html file
    const pagePartsResult = await loadPageParts(
        vite,
        route,
        options.pagesRootFolder,
        options.projectRootFolder,
        options.jayRollupConfig,
        { preRenderedPath: cachedEntry.preRenderedPath },
    );

    if (!pagePartsResult.val) {
        console.log(pagePartsResult.validations.join('\n'));
        res.status(500).end(pagePartsResult.validations.join('\n'));
        return;
    }

    const { parts: pageParts, clientTrackByMap, usedPackages } = pagePartsResult.val;

    const pluginsForPage = filterPluginsForPage(
        allPluginClientInits,
        allPluginsWithInit,
        usedPackages,
    );

    // Run fast phase with cached carryForward
    const renderedFast = await renderFastChangingData(
        pageParams,
        pageProps,
        cachedEntry.carryForward,
        pageParts,
    );

    if (renderedFast.kind !== 'PhaseOutput') {
        handleOtherResponseCodes(res, renderedFast);
        return;
    }

    // Only fast+interactive viewState (slow is baked into jay-html)
    // Use the pre-rendered file path so Vite compiles it
    await sendResponse(
        vite, res, url, cachedEntry.preRenderedPath, pageParts, renderedFast.rendered,
        renderedFast.carryForward, clientTrackByMap, projectInit, pluginsForPage,
    );
}

/**
 * Handle request with pre-rendering and caching.
 * Pre-renders the jay-html, caches it, then continues with fast rendering.
 */
async function handlePreRenderRequest(
    vite: ViteDevServer,
    route: JayRoute,
    options: DevServerOptions,
    slowlyPhase: SlowlyChangingPhase,
    slowRenderCache: SlowRenderCache,
    pageParams: Record<string, string>,
    pageProps: PageProps,
    allPluginClientInits: PluginClientInitInfo[],
    allPluginsWithInit: PluginWithInit[],
    projectInit: ProjectClientInitInfo | undefined,
    res: Response,
    url: string,
): Promise<void> {
    // First, load page parts with original jay-html to get component definitions
    const initialPartsResult = await loadPageParts(
        vite,
        route,
        options.pagesRootFolder,
        options.projectRootFolder,
        options.jayRollupConfig,
    );

    if (!initialPartsResult.val) {
        console.log(initialPartsResult.validations.join('\n'));
        res.status(500).end(initialPartsResult.validations.join('\n'));
        return;
    }

    // Run slow phase to get slowViewState and carryForward
    const renderedSlowly = await slowlyPhase.runSlowlyForPage(
        pageParams,
        pageProps,
        initialPartsResult.val.parts,
    );

    if (renderedSlowly.kind !== 'PhaseOutput') {
        if (renderedSlowly.kind === 'ClientError') {
            handleOtherResponseCodes(res, renderedSlowly);
        }
        return;
    }

    // Pre-render the jay-html with slow viewState
    const preRenderedContent = await preRenderJayHtml(route, renderedSlowly.rendered);
    
    if (!preRenderedContent) {
        res.status(500).end('Failed to pre-render jay-html');
        return;
    }

    // Cache the result (writes to disk and returns the path)
    const preRenderedPath = await slowRenderCache.set(
        route.jayHtmlPath,
        pageParams,
        preRenderedContent,
        renderedSlowly.rendered,
        renderedSlowly.carryForward,
    );
    console.log(`[SlowRender] Cached pre-rendered jay-html at ${preRenderedPath}`);

    // Load page parts with pre-rendered jay-html file
    const pagePartsResult = await loadPageParts(
        vite,
        route,
        options.pagesRootFolder,
        options.projectRootFolder,
        options.jayRollupConfig,
        { preRenderedPath },
    );

    if (!pagePartsResult.val) {
        console.log(pagePartsResult.validations.join('\n'));
        res.status(500).end(pagePartsResult.validations.join('\n'));
        return;
    }

    const { parts: pageParts, clientTrackByMap, usedPackages } = pagePartsResult.val;

    const pluginsForPage = filterPluginsForPage(
        allPluginClientInits,
        allPluginsWithInit,
        usedPackages,
    );

    // Run fast phase
    const renderedFast = await renderFastChangingData(
        pageParams,
        pageProps,
        renderedSlowly.carryForward,
        pageParts,
    );

    if (renderedFast.kind !== 'PhaseOutput') {
        handleOtherResponseCodes(res, renderedFast);
        return;
    }

    // Only fast+interactive viewState (slow is baked into jay-html)
    // Use the pre-rendered file path so Vite compiles it
    await sendResponse(
        vite, res, url, preRenderedPath, pageParts, renderedFast.rendered,
        renderedFast.carryForward, clientTrackByMap, projectInit, pluginsForPage,
    );
}

/**
 * Handle request without slow render caching.
 * Used when caching is disabled. Sends full viewState (slow + fast) to client.
 */
async function handleDirectRequest(
    vite: ViteDevServer,
    route: JayRoute,
    options: DevServerOptions,
    slowlyPhase: SlowlyChangingPhase,
    pageParams: Record<string, string>,
    pageProps: PageProps,
    allPluginClientInits: PluginClientInitInfo[],
    allPluginsWithInit: PluginWithInit[],
    projectInit: ProjectClientInitInfo | undefined,
    res: Response,
    url: string,
): Promise<void> {
    const pagePartsResult = await loadPageParts(
        vite,
        route,
        options.pagesRootFolder,
        options.projectRootFolder,
        options.jayRollupConfig,
    );

    if (!pagePartsResult.val) {
        console.log(pagePartsResult.validations.join('\n'));
        res.status(500).end(pagePartsResult.validations.join('\n'));
        return;
    }

    const {
        parts: pageParts,
        serverTrackByMap,
        clientTrackByMap,
        usedPackages,
    } = pagePartsResult.val;

    const pluginsForPage = filterPluginsForPage(
        allPluginClientInits,
        allPluginsWithInit,
        usedPackages,
    );

    // Run slow phase
    const renderedSlowly = await slowlyPhase.runSlowlyForPage(
        pageParams,
        pageProps,
        pageParts,
    );

    if (renderedSlowly.kind !== 'PhaseOutput') {
        if (renderedSlowly.kind === 'ClientError') {
            handleOtherResponseCodes(res, renderedSlowly);
        }
        return;
    }

    // Run fast phase
    const renderedFast = await renderFastChangingData(
        pageParams,
        pageProps,
        renderedSlowly.carryForward,
        pageParts,
    );

    if (renderedFast.kind !== 'PhaseOutput') {
        handleOtherResponseCodes(res, renderedFast);
        return;
    }

    // Deep merge slow + fast viewState
    let viewState: object;
    if (serverTrackByMap && Object.keys(serverTrackByMap).length > 0) {
        viewState = deepMergeViewStates(
            renderedSlowly.rendered,
            renderedFast.rendered,
            serverTrackByMap,
        );
    } else {
        viewState = { ...renderedSlowly.rendered, ...renderedFast.rendered };
    }

    // Use original jay-html path (no pre-rendering)
    await sendResponse(
        vite, res, url, route.jayHtmlPath, pageParts, viewState,
        renderedFast.carryForward, clientTrackByMap, projectInit, pluginsForPage,
    );
}

/**
 * Send the final HTML response to the client.
 * @param jayHtmlPath - Path to the jay-html file (pre-rendered or original)
 */
async function sendResponse(
    vite: ViteDevServer,
    res: Response,
    url: string,
    jayHtmlPath: string,
    pageParts: any[],
    viewState: object,
    carryForward: object,
    clientTrackByMap: Record<string, string> | undefined,
    projectInit: ProjectClientInitInfo | undefined,
    pluginsForPage: PluginClientInitInfo[],
): Promise<void> {
    const pageHtml = generateClientScript(
        viewState,
        carryForward,
        pageParts,
        jayHtmlPath,
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
}

/**
 * Pre-render the jay-html with slow viewState.
 * Returns the pre-rendered jay-html content, or undefined if pre-rendering fails.
 */
async function preRenderJayHtml(
    route: JayRoute,
    slowViewState: object,
): Promise<string | undefined> {
    // Read the original jay-html
    const jayHtmlContent = await fs.readFile(route.jayHtmlPath, 'utf-8');
    
    // Try to load and parse the contract for phase detection
    // The contract can come from:
    // 1. A .jay-contract file beside the jay-html
    // 2. Headless components imported in the jay-html (handled by slowRenderTransform via the jay-html content)
    const contractPath = route.jayHtmlPath.replace('.jay-html', '.jay-contract');
    let contract;
    
    try {
        const contractContent = await fs.readFile(contractPath, 'utf-8');
        // Contract file exists - parse it (errors should fail the function)
        const parseResult = parseContract(contractContent, path.basename(contractPath));
        if (parseResult.val) {
            contract = parseResult.val;
        } else if (parseResult.validations.length > 0) {
            console.error(`[SlowRender] Contract parse error for ${contractPath}:`, parseResult.validations);
            return undefined;
        }
    } catch (error) {
        // File doesn't exist - that's OK, continue without contract
        // The jay-html may have headless components that provide phase info
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            // Some other error (permissions, etc.) - log and fail
            console.error(`[SlowRender] Error reading contract ${contractPath}:`, error);
            return undefined;
        }
    }

    // Transform the jay-html
    const result = slowRenderTransform({
        jayHtmlContent,
        slowViewState: slowViewState as Record<string, unknown>,
        contract,
    });

    if (result.val) {
        return result.val.preRenderedJayHtml;
    }

    if (result.validations.length > 0) {
        console.error(`[SlowRender] Transform failed for ${route.jayHtmlPath}:`, result.validations);
    }
    return undefined;
}

export async function mkDevServer(options: DevServerOptions): Promise<DevServer> {
    const {
        publicBaseUrlPath,
        pagesRootFolder,
        projectRootFolder,
        buildFolder,
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

    // Create slow render cache for pre-rendered jay-html
    // Files are written to <buildFolder>/slow-render-cache/
    const slowRenderCacheDir = path.join(buildFolder!, 'slow-render-cache');
    const slowRenderCache = new SlowRenderCache(slowRenderCacheDir, pagesRootFolder);

    // Set up file watching for slow render cache invalidation
    setupSlowRenderCacheInvalidation(vite, slowRenderCache, pagesRootFolder);

    // Get init info for embedding in generated pages
    const projectInit = lifecycleManager.getProjectInit() ?? undefined;
    const pluginsWithInit = lifecycleManager.getPluginsWithInit();
    const pluginClientInits = preparePluginClientInits(pluginsWithInit);

    const devServerRoutes: DevServerRoute[] = routes.map((route: JayRoute) =>
        mkRoute(route, vite, slowlyPhase, options, slowRenderCache, projectInit, pluginsWithInit, pluginClientInits),
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

/**
 * Sets up file watching for slow render cache invalidation.
 * 
 * When jay-html, page.ts, or contract files change, the cached pre-rendered
 * jay-html is invalidated (deleted from disk) so it will be regenerated on the next request.
 */
function setupSlowRenderCacheInvalidation(
    vite: ViteDevServer,
    cache: SlowRenderCache,
    pagesRootFolder: string,
): void {
    vite.watcher.on('change', (changedPath) => {
        // Only process files in the pages folder
        if (!changedPath.startsWith(pagesRootFolder)) {
            return;
        }

        // Invalidate cache for jay-html file changes
        if (changedPath.endsWith('.jay-html')) {
            cache.invalidate(changedPath).then(() => {
                console.log(`[SlowRender] Cache invalidated for ${changedPath}`);
            });
            return;
        }

        // Invalidate cache for page.ts changes (component code affects slow render)
        if (changedPath.endsWith('page.ts')) {
            // The jay-html is in the same directory as page.ts
            const dir = path.dirname(changedPath);
            const jayHtmlPath = path.join(dir, 'page.jay-html');
            cache.invalidate(jayHtmlPath).then(() => {
                console.log(`[SlowRender] Cache invalidated for ${jayHtmlPath} (page.ts changed)`);
            });
            return;
        }

        // Invalidate cache for contract changes
        if (changedPath.endsWith('.jay-contract')) {
            // The jay-html has the same name as the contract
            const jayHtmlPath = changedPath.replace('.jay-contract', '.jay-html');
            cache.invalidate(jayHtmlPath).then(() => {
                console.log(`[SlowRender] Cache invalidated for ${jayHtmlPath} (contract changed)`);
            });
            return;
        }
    });
}
