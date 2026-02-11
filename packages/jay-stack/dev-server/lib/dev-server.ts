import { Connect, ViteDevServer } from 'vite';
import { createViteServer } from './vite-factory';
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
import {
    slowRenderTransform,
    parseContract,
    HeadlessContractInfo,
    Contract,
    JAY_IMPORT_RESOLVER,
    discoverHeadlessInstances,
    resolveHeadlessInstances,
} from '@jay-framework/compiler-jay-html';
import {
    LoadedPageParts,
    getServiceRegistry,
    materializeContracts,
    resolveServices,
    slowRenderInstances,
    validateForEachInstances,
    type HeadlessInstanceComponent,
    type InstancePhaseData,
    type ForEachHeadlessInstance,
} from '@jay-framework/stack-server-runtime';
import { WithValidations } from '@jay-framework/compiler-shared';
import { getLogger, getDevLogger, type RequestTiming } from '@jay-framework/logger';

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
        // Start request timing
        const timing = getDevLogger()?.startRequest(req.method, req.path);

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
            let cachedEntry = useSlowRenderCache
                ? slowRenderCache.get(route.jayHtmlPath, pageParams)
                : undefined;

            // Verify the cached file still exists (could be deleted while server is running)
            if (cachedEntry) {
                try {
                    await fs.access(cachedEntry.preRenderedPath);
                } catch {
                    // Cached file was deleted, invalidate and rebuild
                    getLogger().info(
                        `[SlowRender] Cached file missing, rebuilding: ${cachedEntry.preRenderedPath}`,
                    );
                    await slowRenderCache.invalidate(route.jayHtmlPath);
                    cachedEntry = undefined;
                }
            }

            if (cachedEntry) {
                // Cache hit: use cached pre-rendered jay-html and carryForward
                // No need to run slow rendering - everything is cached
                await handleCachedRequest(
                    vite,
                    route,
                    options,
                    cachedEntry,
                    pageParams,
                    pageProps,
                    allPluginClientInits,
                    allPluginsWithInit,
                    projectInit,
                    res,
                    url,
                    timing,
                );
            } else if (useSlowRenderCache) {
                // Cache miss with caching enabled: pre-render and cache
                await handlePreRenderRequest(
                    vite,
                    route,
                    options,
                    slowlyPhase,
                    slowRenderCache,
                    pageParams,
                    pageProps,
                    allPluginClientInits,
                    allPluginsWithInit,
                    projectInit,
                    res,
                    url,
                    timing,
                );
            } else {
                // Caching disabled: run slow render on each request, full viewState to client
                await handleDirectRequest(
                    vite,
                    route,
                    options,
                    slowlyPhase,
                    pageParams,
                    pageProps,
                    allPluginClientInits,
                    allPluginsWithInit,
                    projectInit,
                    res,
                    url,
                    timing,
                );
            }
        } catch (e) {
            vite?.ssrFixStacktrace(e);
            getLogger().error(e.stack);
            res.status(500).end(e.stack);
            timing?.end();
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
    timing?: RequestTiming,
): Promise<void> {
    // Load page parts with cached pre-rendered jay-html file
    const loadStart = Date.now();
    const pagePartsResult: WithValidations<LoadedPageParts> = await loadPageParts(
        vite,
        route,
        options.pagesRootFolder,
        options.projectRootFolder,
        options.jayRollupConfig,
        { preRenderedPath: cachedEntry.preRenderedPath },
    );
    timing?.recordViteSsr(Date.now() - loadStart);

    if (!pagePartsResult.val) {
        getLogger().info(pagePartsResult.validations.join('\n'));
        res.status(500).end(pagePartsResult.validations.join('\n'));
        timing?.end();
        return;
    }

    const { parts: pageParts, clientTrackByMap, usedPackages } = pagePartsResult.val;

    const pluginsForPage = filterPluginsForPage(
        allPluginClientInits,
        allPluginsWithInit,
        usedPackages,
    );

    // Run fast phase for key-based parts
    const fastStart = Date.now();
    const renderedFast = await renderFastChangingData(
        pageParams,
        pageProps,
        cachedEntry.carryForward,
        pageParts,
    );
    timing?.recordFastRender(Date.now() - fastStart);

    if (renderedFast.kind !== 'PhaseOutput') {
        handleOtherResponseCodes(res, renderedFast);
        timing?.end();
        return;
    }

    // Run fast phase for headless instances (if any)
    let fastViewState = renderedFast.rendered;
    let fastCarryForward = renderedFast.carryForward;

    const instancePhaseData = (cachedEntry.carryForward as any)?.__instances as
        | InstancePhaseData
        | undefined;
    const headlessComps = pagePartsResult.val.headlessInstanceComponents;
    if (instancePhaseData && headlessComps.length > 0) {
        const instanceFastResult = await renderFastChangingDataForInstances(
            instancePhaseData,
            headlessComps,
        );
        if (instanceFastResult) {
            fastViewState = {
                ...fastViewState,
                __headlessInstances: instanceFastResult.viewStates,
            };
            fastCarryForward = {
                ...fastCarryForward,
                __headlessInstances: instanceFastResult.carryForwards,
            };
        }

        // Run fast phase for forEach instances (per-item rendering)
        if (instancePhaseData.forEachInstances && instancePhaseData.forEachInstances.length > 0) {
            const forEachResult = await renderFastChangingDataForForEachInstances(
                instancePhaseData.forEachInstances,
                headlessComps,
                fastViewState,
            );
            if (forEachResult) {
                const existingHeadless = (fastViewState as any).__headlessInstances || {};
                fastViewState = {
                    ...fastViewState,
                    __headlessInstances: { ...existingHeadless, ...forEachResult },
                };
            }
        }
    }

    // Only fast+interactive viewState (slow is baked into jay-html)
    // Use the pre-rendered file path so Vite compiles it
    // Pass slowViewState so automation can show full merged state
    await sendResponse(
        vite,
        res,
        url,
        cachedEntry.preRenderedPath,
        pageParts,
        fastViewState,
        fastCarryForward,
        clientTrackByMap,
        projectInit,
        pluginsForPage,
        options,
        cachedEntry.slowViewState,
        timing,
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
    timing?: RequestTiming,
): Promise<void> {
    // First, load page parts with original jay-html to get component definitions
    const loadStart = Date.now();
    const initialPartsResult = await loadPageParts(
        vite,
        route,
        options.pagesRootFolder,
        options.projectRootFolder,
        options.jayRollupConfig,
    );
    timing?.recordViteSsr(Date.now() - loadStart);

    if (!initialPartsResult.val) {
        getLogger().info(initialPartsResult.validations.join('\n'));
        res.status(500).end(initialPartsResult.validations.join('\n'));
        timing?.end();
        return;
    }

    // Run slow phase to get slowViewState and carryForward
    // Includes key-based parts slow render + pre-render pipeline (instance slow render)
    const slowStart = Date.now();
    const renderedSlowly = await slowlyPhase.runSlowlyForPage(
        pageParams,
        pageProps,
        initialPartsResult.val.parts,
    );

    if (renderedSlowly.kind !== 'PhaseOutput') {
        timing?.recordSlowRender(Date.now() - slowStart);
        if (renderedSlowly.kind === 'ClientError') {
            handleOtherResponseCodes(res, renderedSlowly);
        }
        timing?.end();
        return;
    }

    // Pre-render the jay-html with slow viewState (two-pass pipeline)
    // Pass 1: page-level bindings, Pass 2: headless instance bindings
    const preRenderResult = await preRenderJayHtml(
        route,
        renderedSlowly.rendered,
        initialPartsResult.val.headlessContracts,
        initialPartsResult.val.headlessInstanceComponents,
    );
    timing?.recordSlowRender(Date.now() - slowStart);

    if (!preRenderResult) {
        res.status(500).end('Failed to pre-render jay-html');
        timing?.end();
        return;
    }

    // Merge instance phase data into page carryForward so fast phase can access it
    let instancePhaseDataForCache = preRenderResult.instancePhaseData;
    if (instancePhaseDataForCache && preRenderResult.forEachInstances) {
        instancePhaseDataForCache = {
            ...instancePhaseDataForCache,
            forEachInstances: preRenderResult.forEachInstances,
        };
    } else if (preRenderResult.forEachInstances) {
        instancePhaseDataForCache = {
            discovered: [],
            carryForwards: {},
            forEachInstances: preRenderResult.forEachInstances,
        };
    }
    const carryForward = instancePhaseDataForCache
        ? { ...renderedSlowly.carryForward, __instances: instancePhaseDataForCache }
        : renderedSlowly.carryForward;

    // Cache the result (writes to disk and returns the path)
    const preRenderedPath = await slowRenderCache.set(
        route.jayHtmlPath,
        pageParams,
        preRenderResult.preRenderedJayHtml,
        renderedSlowly.rendered,
        carryForward,
    );
    getLogger().info(`[SlowRender] Cached pre-rendered jay-html at ${preRenderedPath}`);

    // Load page parts with pre-rendered jay-html file (no timing - already counted)
    const pagePartsResult = await loadPageParts(
        vite,
        route,
        options.pagesRootFolder,
        options.projectRootFolder,
        options.jayRollupConfig,
        { preRenderedPath },
    );

    if (!pagePartsResult.val) {
        getLogger().info(pagePartsResult.validations.join('\n'));
        res.status(500).end(pagePartsResult.validations.join('\n'));
        timing?.end();
        return;
    }

    const { parts: pageParts, clientTrackByMap, usedPackages } = pagePartsResult.val;

    const pluginsForPage = filterPluginsForPage(
        allPluginClientInits,
        allPluginsWithInit,
        usedPackages,
    );

    // Run fast phase for key-based parts
    const fastStart = Date.now();
    const renderedFast = await renderFastChangingData(
        pageParams,
        pageProps,
        carryForward,
        pageParts,
    );
    timing?.recordFastRender(Date.now() - fastStart);

    if (renderedFast.kind !== 'PhaseOutput') {
        handleOtherResponseCodes(res, renderedFast);
        timing?.end();
        return;
    }

    // Run fast phase for headless instances (if any)
    let fastViewState = renderedFast.rendered;
    let fastCarryForward = renderedFast.carryForward;

    const instancePhaseData = (carryForward as any)?.__instances as InstancePhaseData | undefined;
    const headlessComps = pagePartsResult.val.headlessInstanceComponents;
    if (instancePhaseData && headlessComps.length > 0) {
        const instanceFastResult = await renderFastChangingDataForInstances(
            instancePhaseData,
            headlessComps,
        );
        if (instanceFastResult) {
            fastViewState = {
                ...fastViewState,
                __headlessInstances: instanceFastResult.viewStates,
            };
            fastCarryForward = {
                ...fastCarryForward,
                __headlessInstances: instanceFastResult.carryForwards,
            };
        }

        // Run fast phase for forEach instances (per-item rendering)
        if (instancePhaseData.forEachInstances && instancePhaseData.forEachInstances.length > 0) {
            const forEachResult = await renderFastChangingDataForForEachInstances(
                instancePhaseData.forEachInstances,
                headlessComps,
                fastViewState,
            );
            if (forEachResult) {
                const existingHeadless = (fastViewState as any).__headlessInstances || {};
                fastViewState = {
                    ...fastViewState,
                    __headlessInstances: { ...existingHeadless, ...forEachResult },
                };
            }
        }
    }

    // Only fast+interactive viewState (slow is baked into jay-html)
    // Use the pre-rendered file path so Vite compiles it
    // Pass slowViewState so automation can show full merged state
    await sendResponse(
        vite,
        res,
        url,
        preRenderedPath,
        pageParts,
        fastViewState,
        fastCarryForward,
        clientTrackByMap,
        projectInit,
        pluginsForPage,
        options,
        renderedSlowly.rendered,
        timing,
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
    timing?: RequestTiming,
): Promise<void> {
    const loadStart = Date.now();
    const pagePartsResult = await loadPageParts(
        vite,
        route,
        options.pagesRootFolder,
        options.projectRootFolder,
        options.jayRollupConfig,
    );
    timing?.recordViteSsr(Date.now() - loadStart);

    if (!pagePartsResult.val) {
        getLogger().info(pagePartsResult.validations.join('\n'));
        res.status(500).end(pagePartsResult.validations.join('\n'));
        timing?.end();
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

    // Run slow phase (key-based parts + headless instance slow rendering)
    const slowStart = Date.now();
    const renderedSlowly = await slowlyPhase.runSlowlyForPage(pageParams, pageProps, pageParts);

    if (renderedSlowly.kind !== 'PhaseOutput') {
        timing?.recordSlowRender(Date.now() - slowStart);
        if (renderedSlowly.kind === 'ClientError') {
            handleOtherResponseCodes(res, renderedSlowly);
        }
        timing?.end();
        return;
    }

    // Run slow phase for headless instances
    let instanceViewStates: Record<string, object> | undefined;
    let instancePhaseDataForFast: InstancePhaseData | undefined;
    let forEachInstancesForFast: ForEachHeadlessInstance[] | undefined;
    const headlessInstanceComponents = pagePartsResult.val.headlessInstanceComponents ?? [];

    if (headlessInstanceComponents.length > 0) {
        const jayHtmlContent = await fs.readFile(route.jayHtmlPath, 'utf-8');
        const discoveryResult = discoverHeadlessInstances(jayHtmlContent);

        // Validate: forEach instances must not have slow phases
        if (discoveryResult.forEachInstances.length > 0) {
            const validationErrors = validateForEachInstances(
                discoveryResult.forEachInstances,
                headlessInstanceComponents,
            );
            if (validationErrors.length > 0) {
                getLogger().error(
                    `[SlowRender] ForEach instance validation failed: ${validationErrors.join(', ')}`,
                );
                res.status(500).end(validationErrors.join('\n'));
                timing?.end();
                return;
            }
            forEachInstancesForFast = discoveryResult.forEachInstances;
        }

        if (discoveryResult.instances.length > 0) {
            const slowResult = await slowRenderInstances(
                discoveryResult.instances,
                headlessInstanceComponents,
            );
            if (slowResult) {
                instanceViewStates = { ...slowResult.slowViewStates };
                instancePhaseDataForFast = slowResult.instancePhaseData;
            }
        }
    }
    timing?.recordSlowRender(Date.now() - slowStart);

    // Run fast phase (key-based parts + headless instance fast rendering)
    const fastStart = Date.now();
    const renderedFast = await renderFastChangingData(
        pageParams,
        pageProps,
        renderedSlowly.carryForward,
        pageParts,
    );

    // Run fast phase for static headless instances
    if (instancePhaseDataForFast && instanceViewStates) {
        const instanceFastResult = await renderFastChangingDataForInstances(
            instancePhaseDataForFast,
            headlessInstanceComponents,
        );
        if (instanceFastResult) {
            for (const [coordKey, fastVS] of Object.entries(instanceFastResult.viewStates)) {
                instanceViewStates[coordKey] = {
                    ...(instanceViewStates[coordKey] || {}),
                    ...fastVS,
                };
            }
        }
    }

    // Run fast phase for forEach headless instances (per-item rendering)
    if (forEachInstancesForFast && renderedFast.kind === 'PhaseOutput') {
        const forEachResult = await renderFastChangingDataForForEachInstances(
            forEachInstancesForFast,
            headlessInstanceComponents,
            { ...renderedSlowly.rendered, ...renderedFast.rendered },
        );
        if (forEachResult) {
            if (!instanceViewStates) instanceViewStates = {};
            for (const [coordKey, fastVS] of Object.entries(forEachResult)) {
                instanceViewStates[coordKey] = fastVS;
            }
        }
    }
    timing?.recordFastRender(Date.now() - fastStart);

    if (renderedFast.kind !== 'PhaseOutput') {
        handleOtherResponseCodes(res, renderedFast);
        timing?.end();
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

    // Add headless instance viewStates if any
    if (instanceViewStates && Object.keys(instanceViewStates).length > 0) {
        viewState = {
            ...viewState,
            __headlessInstances: instanceViewStates,
        };
    }

    // Use original jay-html path (no pre-rendering)
    await sendResponse(
        vite,
        res,
        url,
        route.jayHtmlPath,
        pageParts,
        viewState,
        renderedFast.carryForward,
        clientTrackByMap,
        projectInit,
        pluginsForPage,
        options,
        undefined,
        timing,
    );
}

/**
 * Send the final HTML response to the client.
 * @param jayHtmlPath - Path to the jay-html file (pre-rendered or original)
 * @param slowViewState - Optional slow ViewState (for automation when slow rendering is used)
 * @param timing - Optional request timing to record vite-client time
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
    options: DevServerOptions,
    slowViewState?: object,
    timing?: RequestTiming,
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
        {
            enableAutomation: !options.disableAutomation,
            slowViewState,
        },
    );

    // Save generated client script to build folder for debugging
    if (options.buildFolder) {
        const pageName = !url || url === '/' ? 'index' : url.replace(/^\//, '').replace(/\//g, '-');
        const clientScriptDir = path.join(options.buildFolder, 'client-scripts');
        await fs.mkdir(clientScriptDir, { recursive: true });
        await fs.writeFile(path.join(clientScriptDir, `${pageName}.html`), pageHtml, 'utf-8');
    }

    const viteStart = Date.now();
    const compiledPageHtml = await vite.transformIndexHtml(!!url ? url : '/', pageHtml);
    timing?.recordViteClient(Date.now() - viteStart);

    res.status(200).set({ 'Content-Type': 'text/html' }).send(compiledPageHtml);
    timing?.end();
}

/**
 * Result of pre-rendering jay-html, including instance carryForward data.
 */
interface PreRenderResult {
    /** The fully pre-rendered jay-html content */
    preRenderedJayHtml: string;
    /** Instance data for the fast phase (discovery info + carryForwards) */
    instancePhaseData?: InstancePhaseData;
    /** ForEach instances that need per-item fast rendering */
    forEachInstances?: ForEachHeadlessInstance[];
}

// InstancePhaseData is now imported from stack-server-runtime

/**
 * Pre-render the jay-html with slow viewState.
 *
 * Uses a two-pass pipeline:
 * - Pass 1: Resolve page-level slow bindings, unroll slow forEach
 * - Pass 2: Discover headless instances, call slowlyRender for each, resolve instance bindings
 *
 * @param route - The route containing the jay-html path
 * @param slowViewState - The slow phase view state data
 * @param headlessContracts - Key-based headless contracts (from loadPageParts)
 * @param headlessInstanceComponents - Instance-only headless components (from loadPageParts)
 */
async function preRenderJayHtml(
    route: JayRoute,
    slowViewState: object,
    headlessContracts: HeadlessContractInfo[],
    headlessInstanceComponents: HeadlessInstanceComponent[],
): Promise<PreRenderResult | undefined> {
    // Read the original jay-html
    const jayHtmlContent = await fs.readFile(route.jayHtmlPath, 'utf-8');

    // Try to load and parse the main contract for phase detection
    const contractPath = route.jayHtmlPath.replace('.jay-html', '.jay-contract');
    let contract: Contract | undefined;

    try {
        const contractContent = await fs.readFile(contractPath, 'utf-8');
        // Contract file exists - parse it (errors should fail the function)
        const parseResult = parseContract(contractContent, path.basename(contractPath));
        if (parseResult.val) {
            contract = parseResult.val;
        } else if (parseResult.validations.length > 0) {
            getLogger().error(
                `[SlowRender] Contract parse error for ${contractPath}: ${parseResult.validations.join(', ')}`,
            );
            return undefined;
        }
    } catch (error) {
        // File doesn't exist - that's OK, continue without contract
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            // Some other error (permissions, etc.) - log and fail
            getLogger().error(`[SlowRender] Error reading contract ${contractPath}: ${error}`);
            return undefined;
        }
    }

    // ── Pass 1: Resolve page-level slow bindings ──
    const result = slowRenderTransform({
        jayHtmlContent,
        slowViewState: slowViewState as Record<string, unknown>,
        contract,
        headlessContracts,
        sourceDir: path.dirname(route.jayHtmlPath),
        importResolver: JAY_IMPORT_RESOLVER,
    });

    if (!result.val) {
        if (result.validations.length > 0) {
            getLogger().error(
                `[SlowRender] Transform failed for ${route.jayHtmlPath}: ${result.validations.join(', ')}`,
            );
        }
        return undefined;
    }

    let preRenderedJayHtml = result.val.preRenderedJayHtml;
    let instancePhaseData: InstancePhaseData | undefined;

    // ── Pass 2: Resolve headless instance bindings ──
    let forEachInstances: ForEachHeadlessInstance[] | undefined;

    if (headlessInstanceComponents.length > 0) {
        const discoveryResult = discoverHeadlessInstances(preRenderedJayHtml);
        // Use the HTML with embedded ref attributes for downstream consumers
        preRenderedJayHtml = discoveryResult.preRenderedJayHtml;

        // Validate: forEach instances must not have slow phases
        if (discoveryResult.forEachInstances.length > 0) {
            const validationErrors = validateForEachInstances(
                discoveryResult.forEachInstances,
                headlessInstanceComponents,
            );
            if (validationErrors.length > 0) {
                getLogger().error(
                    `[SlowRender] ForEach instance validation failed: ${validationErrors.join(', ')}`,
                );
                return undefined;
            }
            forEachInstances = discoveryResult.forEachInstances;
        }

        if (discoveryResult.instances.length > 0) {
            const slowResult = await slowRenderInstances(
                discoveryResult.instances,
                headlessInstanceComponents,
            );

            if (slowResult) {
                instancePhaseData = slowResult.instancePhaseData;

                // Apply instance data to resolve bindings in inline templates
                // Uses the ref-annotated HTML so resolveHeadlessInstances can read refs
                const pass2Result = resolveHeadlessInstances(
                    preRenderedJayHtml,
                    slowResult.resolvedData,
                    JAY_IMPORT_RESOLVER,
                );

                if (pass2Result.val) {
                    preRenderedJayHtml = pass2Result.val;
                }

                if (pass2Result.validations.length > 0) {
                    getLogger().error(
                        `[SlowRender] Instance resolution warnings for ${route.jayHtmlPath}: ${pass2Result.validations.join(', ')}`,
                    );
                }
            }
        }
    }

    return { preRenderedJayHtml, instancePhaseData, forEachInstances };
}

/**
 * Run fast render phase for headless component instances.
 *
 * For each discovered instance, calls the component's fastRender with
 * the instance props and its slow-phase carryForward.
 *
 * @returns Instance fast ViewStates and carryForwards, or undefined if no instances have fastRender
 */
async function renderFastChangingDataForInstances(
    instancePhaseData: InstancePhaseData,
    headlessInstanceComponents: HeadlessInstanceComponent[],
): Promise<
    { viewStates: Record<string, object>; carryForwards: Record<string, object> } | undefined
> {
    // Build a lookup from contract name to component info
    const componentByContractName = new Map<string, HeadlessInstanceComponent>();
    for (const comp of headlessInstanceComponents) {
        componentByContractName.set(comp.contractName, comp);
    }

    const viewStates: Record<string, object> = {};
    const carryForwards: Record<string, object> = {};
    let hasResults = false;

    for (const instance of instancePhaseData.discovered) {
        const coordKey = instance.coordinate.join('/');
        const comp = componentByContractName.get(instance.contractName);

        if (!comp || !comp.compDefinition.fastRender) {
            continue;
        }

        // Get the instance's slow-phase carryForward
        const instanceCarryForward = instancePhaseData.carryForwards[coordKey] || {};

        // Resolve services for this component
        const services = resolveServices(comp.compDefinition.services);

        // Call the component's fastRender with instance props and carryForward
        const fastResult = await comp.compDefinition.fastRender(
            instance.props,
            instanceCarryForward,
            ...services,
        );

        if (fastResult.kind === 'PhaseOutput') {
            viewStates[coordKey] = fastResult.rendered;
            carryForwards[coordKey] = fastResult.carryForward;
            hasResults = true;
        }
    }

    return hasResults ? { viewStates, carryForwards } : undefined;
}

/**
 * Run fast render phase for headless instances inside forEach blocks.
 *
 * These instances have no slow phase. For each forEach item, resolve props
 * from the item data and call the component's fastRender.
 *
 * Uses Coordinate convention: [trackByValue, ...suffix] joined with comma
 * (matching Array.toString() used by the runtime Coordinate type).
 */
async function renderFastChangingDataForForEachInstances(
    forEachInstances: ForEachHeadlessInstance[],
    headlessInstanceComponents: HeadlessInstanceComponent[],
    mergedViewState: object,
): Promise<Record<string, object> | undefined> {
    const componentByContractName = new Map<string, HeadlessInstanceComponent>();
    for (const comp of headlessInstanceComponents) {
        componentByContractName.set(comp.contractName, comp);
    }

    const viewStates: Record<string, object> = {};
    let hasResults = false;

    for (const instance of forEachInstances) {
        const comp = componentByContractName.get(instance.contractName);
        if (!comp) continue;

        // Resolve the forEach array from the merged (slow + fast) viewState
        const items = resolvePathValue(mergedViewState, instance.forEachPath);
        if (!Array.isArray(items)) continue;

        for (const item of items) {
            const trackByValue = String(item[instance.trackBy]);

            // Resolve props from item data using prop bindings
            const props: Record<string, string> = {};
            for (const [propName, binding] of Object.entries(instance.propBindings)) {
                // Resolve bindings like "{_id}" → item._id
                props[propName] = resolveBinding(String(binding), item);
            }

            if (comp.compDefinition.fastRender) {
                const services = resolveServices(comp.compDefinition.services);
                // No slow phase → fastRender signature is (props, ...services)
                // carryForward is only injected when withSlowlyRender is used
                const fastResult = await comp.compDefinition.fastRender(props, ...services);

                if (fastResult.kind === 'PhaseOutput') {
                    // Coordinate: [trackByValue, coordinateSuffix] → "trackByValue,coordinateSuffix"
                    const coord = [trackByValue, instance.coordinateSuffix].toString();
                    viewStates[coord] = fastResult.rendered;
                    hasResults = true;
                }
            }
        }
    }

    return hasResults ? viewStates : undefined;
}

/**
 * Resolve a dot-path value from an object (e.g., "allProducts.items" → obj.allProducts.items).
 */
function resolvePathValue(obj: any, path: string): any {
    return path.split('.').reduce((current, segment) => current?.[segment], obj);
}

/**
 * Resolve a binding expression against a forEach item.
 * Handles "{fieldName}" → item.fieldName, or literal strings.
 */
function resolveBinding(binding: string, item: any): string {
    const match = binding.match(/^\{(.+)\}$/);
    if (match) {
        return String(item[match[1]] ?? '');
    }
    return binding;
}

/**
 * Materializes dynamic contracts on dev server startup.
 * This allows AI agents to discover available contracts for page generation.
 */
async function materializeDynamicContracts(
    projectRootFolder: string,
    buildFolder: string,
    viteServer: ViteDevServer,
): Promise<void> {
    try {
        const services = getServiceRegistry();
        const result = await materializeContracts(
            {
                projectRoot: projectRootFolder,
                outputDir: path.join(buildFolder, 'materialized-contracts'),
                verbose: false,
                viteServer,
            },
            services,
        );

        const dynamicCount = result.dynamicCount;
        if (dynamicCount > 0) {
            getLogger().info(`[Contracts] Materialized ${dynamicCount} dynamic contract(s)`);
        }
    } catch (error: any) {
        // Don't fail startup - just warn
        getLogger().warn(`[Contracts] Failed to materialize dynamic contracts: ${error.message}`);
    }
}

export async function mkDevServer(rawOptions: DevServerOptions): Promise<DevServer> {
    const options = defaults(rawOptions);
    const {
        publicBaseUrlPath,
        pagesRootFolder,
        projectRootFolder,
        buildFolder,
        jayRollupConfig,
        dontCacheSlowly,
    } = options;

    // Map Jay log level to Vite log level
    const viteLogLevel: 'info' | 'warn' | 'error' | 'silent' =
        options.logLevel === 'silent' ? 'silent' : options.logLevel === 'verbose' ? 'info' : 'warn';

    // Initialize service lifecycle manager
    const lifecycleManager = new ServiceLifecycleManager(projectRootFolder);

    // Set up graceful shutdown handlers
    setupGracefulShutdown(lifecycleManager);

    const vite = await createViteServer({
        projectRoot: projectRootFolder,
        pagesRoot: pagesRootFolder,
        base: publicBaseUrlPath,
        jayRollupConfig,
        logLevel: viteLogLevel,
    });

    // Set the Vite server and initialize services
    lifecycleManager.setViteServer(vite);
    await lifecycleManager.initialize();

    // Materialize dynamic contracts for agent discovery
    await materializeDynamicContracts(projectRootFolder, buildFolder!, vite);

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
        mkRoute(
            route,
            vite,
            slowlyPhase,
            options,
            slowRenderCache,
            projectInit,
            pluginsWithInit,
            pluginClientInits,
        ),
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
        getLogger().important(`\n${signal} received, shutting down gracefully...`);
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
            getLogger().info('[Services] lib/init.ts changed, reloading services...');
            try {
                await lifecycleManager.reload();
                // Trigger browser reload
                vite.ws.send({
                    type: 'full-reload',
                    path: '*',
                });
            } catch (error) {
                getLogger().error(`[Services] Failed to reload services: ${error}`);
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

    getLogger().info(`[Actions] Action router mounted at ${ACTION_ENDPOINT_BASE}`);
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
                getLogger().info(`[SlowRender] Cache invalidated for ${changedPath}`);
            });
            return;
        }

        // Invalidate cache for page.ts changes (component code affects slow render)
        if (changedPath.endsWith('page.ts')) {
            // The jay-html is in the same directory as page.ts
            const dir = path.dirname(changedPath);
            const jayHtmlPath = path.join(dir, 'page.jay-html');
            cache.invalidate(jayHtmlPath).then(() => {
                getLogger().info(
                    `[SlowRender] Cache invalidated for ${jayHtmlPath} (page.ts changed)`,
                );
            });
            return;
        }

        // Invalidate cache for contract changes
        if (changedPath.endsWith('.jay-contract')) {
            // The jay-html has the same name as the contract
            const jayHtmlPath = changedPath.replace('.jay-contract', '.jay-html');
            cache.invalidate(jayHtmlPath).then(() => {
                getLogger().info(
                    `[SlowRender] Cache invalidated for ${jayHtmlPath} (contract changed)`,
                );
            });
            return;
        }
    });
}
