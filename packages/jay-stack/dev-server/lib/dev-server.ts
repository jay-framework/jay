import { Connect, ViteDevServer } from 'vite';
import { createViteServer } from './vite-factory';
import {
    JayRoute,
    JayRoutes,
    routeToExpressRoute,
    scanRoutes,
    createRoute,
} from '@jay-framework/stack-route-scanner';
import {
    DevSlowlyChangingPhase,
    SlowlyChangingPhase,
    getClientInitData,
    preparePluginClientInits,
    type PluginWithInit,
    type PluginClientInitInfo,
    SlowRenderCache,
    type SlowRenderCacheEntry,
} from '@jay-framework/stack-server-runtime';
import type {
    ClientError4xx,
    PageProps,
    Redirect3xx,
    ServerError5xx,
} from '@jay-framework/fullstack-component';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { RequestHandler } from 'express-serve-static-core';
import { renderFastChangingData, mergeHeadTags } from '@jay-framework/stack-server-runtime';
import { loadPageParts } from '@jay-framework/stack-server-runtime';
import {
    generateClientScript,
    generateSSRPageHtml,
    generateFrozenPageHtml,
    clearServerElementCache,
    ProjectClientInitInfo,
} from '@jay-framework/stack-server-runtime';
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
    injectHeadfullFSTemplates,
    assignCoordinatesToJayHtml,
} from '@jay-framework/compiler-jay-html';
import {
    LoadedPageParts,
    getServiceRegistry,
    materializeContracts,
    slowRenderInstances,
    validateForEachInstances,
    type HeadlessInstanceComponent,
    type InstancePhaseData,
    type ForEachHeadlessInstance,
} from '@jay-framework/stack-server-runtime';
import { scanPlugins } from '@jay-framework/stack-server-runtime';
import { WithValidations } from '@jay-framework/compiler-shared';
import { getLogger, getDevLogger, type RequestTiming } from '@jay-framework/logger';
import { FreezeStore } from './freeze';
import { DevServerService, DEV_SERVER_SERVICE } from './dev-server-service';
import { registerService } from '@jay-framework/stack-server-runtime';

/** Callback to register linked files for watching. Set by setupSlowRenderCacheInvalidation. */
let _watchLinkedFiles: (files: string[]) => void = () => {};

async function initRoutes(pagesBaseFolder: string): Promise<JayRoutes> {
    return await scanRoutes(pagesBaseFolder, {
        jayHtmlFilename: 'page.jay-html',
        compFilename: 'page.ts',
    });
}

/**
 * Scan plugins for routes declared in plugin.yaml (DL#130).
 * Resolves jayHtml/css paths via package.json exports.
 * Skips routes that collide with existing project routes.
 */
async function scanPluginRoutes(projectRoot: string, projectRoutes: JayRoutes): Promise<JayRoutes> {
    const plugins = await scanPlugins({ projectRoot, includeDevDeps: true });
    const projectPaths = new Set(projectRoutes.map((r) => r.rawRoute));
    const pluginRoutes: JayRoutes = [];

    for (const [, plugin] of plugins) {
        if (!plugin.manifest.routes) continue;

        for (const route of plugin.manifest.routes) {
            // Skip if project already defines this route
            if (projectPaths.has(route.path)) {
                getLogger().info(
                    `[Routes] Plugin "${plugin.name}" route ${route.path} skipped — project route takes precedence`,
                );
                continue;
            }

            // Resolve jayHtml path via package.json exports
            const jayHtmlPath = resolvePluginExport(plugin.pluginPath, route.jayHtml);
            if (!jayHtmlPath) {
                getLogger().warn(
                    `[Routes] Plugin "${plugin.name}" route ${route.path}: jayHtml "${route.jayHtml}" not found`,
                );
                continue;
            }

            // Resolve component path.
            // For local plugins: component is a relative file path (e.g., ./pages/admin/page.ts)
            // For NPM plugins: component is an exported member name from the module
            const compPath = route.component.startsWith('.')
                ? path.resolve(plugin.pluginPath, route.component)
                : resolvePluginModule(plugin);

            pluginRoutes.push(createRoute(route.path, jayHtmlPath, compPath));

            getLogger().info(`[Routes] Plugin "${plugin.name}" provides route ${route.path}`);
        }
    }

    return pluginRoutes;
}

/** Resolve a plugin export subpath via package.json exports. */
function resolvePluginExport(pluginPath: string, exportSubpath: string): string | undefined {
    // Normalize: strip leading ./ for export lookup
    const normalized = exportSubpath.replace(/^\.\//, '');

    const packageJsonPath = path.join(pluginPath, 'package.json');
    try {
        const packageJson = JSON.parse(fsSync.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.exports) {
            const exportKey = './' + normalized;
            const exportValue = packageJson.exports[exportKey];
            if (exportValue) {
                const resolved =
                    typeof exportValue === 'string'
                        ? exportValue
                        : exportValue.default || exportValue.import || exportValue.require;
                if (resolved) {
                    const fullPath = path.join(pluginPath, resolved);
                    return fullPath;
                }
            }
        }
    } catch {
        /* skip */
    }

    // Fallback: try common locations
    for (const dir of ['dist', 'lib', '']) {
        const candidate = path.join(pluginPath, dir, normalized);
        try {
            fsSync.accessSync(candidate);
            return candidate;
        } catch {
            /* skip */
        }
    }
    return undefined;
}

/** Resolve the main module path for a plugin. */
function resolvePluginModule(plugin: {
    pluginPath: string;
    manifest: { module?: string };
}): string {
    const modulePath = plugin.manifest.module || 'index';
    for (const ext of ['.ts', '.js', '/index.ts', '/index.js']) {
        const candidate = path.join(plugin.pluginPath, modulePath + ext);
        try {
            fsSync.accessSync(candidate);
            return candidate;
        } catch {
            /* skip */
        }
    }
    // Try lib/ directory
    for (const ext of ['.ts', '.js']) {
        const candidate = path.join(plugin.pluginPath, 'lib', path.basename(modulePath) + ext);
        try {
            fsSync.accessSync(candidate);
            return candidate;
        } catch {
            /* skip */
        }
    }
    return path.join(plugin.pluginPath, modulePath);
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
        disableSSR: options.disableSSR,
        jayRollupConfig: {
            ...(options.jayRollupConfig || {}),
            tsConfigFilePath,
            pagesRoot: pagesRootFolder,
            buildFolder,
        },
        httpServer: options.httpServer,
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
    freezeStore?: FreezeStore;
    /** Public API for design board applications and CLI (DL#128) */
    service: DevServerService;
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

    // Start with usedPackages + global plugins (always loaded)
    const expandedPackages = new Set<string>(usedPackages);
    for (const plugin of allPluginsWithInit) {
        if (plugin.global) {
            expandedPackages.add(plugin.packageName);
        }
    }
    const toProcess = [...expandedPackages];

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
    freezeStore: FreezeStore | undefined,
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

            // Parse query parameters from request URL (DL#117).
            // Available in the fast phase only — not passed to slow phase.
            const query: Record<string, string> = {};
            const urlObj = new URL(req.originalUrl, `http://${req.headers.host}`);
            for (const [key, value] of urlObj.searchParams) {
                query[key] = value; // last value wins for repeated keys
            }

            // Frozen page rendering (DL#127): serve a static SSR snapshot
            // from a saved ViewState — no component logic, no client scripts.
            const freezeId = query['_jay_freeze'];
            if (freezeId && freezeStore) {
                timing?.annotate('[FROZEN]');
                await handleFrozenRequest(
                    vite,
                    route,
                    options,
                    freezeStore,
                    slowRenderCache,
                    freezeId,
                    pageParams,
                    query['format'] === 'fragment' ? 'fragment' : 'page',
                    res,
                    timing,
                );
                return;
            }

            if (options.disableSSR) {
                // Client-only rendering: no SSR, no hydration
                await handleClientOnlyRequest(
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
                    query,
                );
            } else {
                // SSR: always use full pipeline with slow render cache
                // get() reads from disk — returns undefined if file is missing or has no metadata
                const cachedEntry = await slowRenderCache.get(route.jayHtmlPath, pageParams);

                if (cachedEntry) {
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
                        query,
                    );
                } else {
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
                        query,
                    );
                }
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
    cachedEntry: SlowRenderCacheEntry,
    pageParams: Record<string, string>,
    pageProps: PageProps,
    allPluginClientInits: PluginClientInitInfo[],
    allPluginsWithInit: PluginWithInit[],
    projectInit: ProjectClientInitInfo | undefined,
    res: Response,
    url: string,
    timing?: RequestTiming,
    query: Record<string, string> = {},
): Promise<void> {
    // Load page parts with cached pre-rendered jay-html content (already stripped of cache tag)
    const loadStart = Date.now();
    const pagePartsResult: WithValidations<LoadedPageParts> = await loadPageParts(
        vite,
        route,
        options.pagesRootFolder,
        options.projectRootFolder,
        options.jayRollupConfig,
        {
            preRenderedPath: cachedEntry.preRenderedPath,
            preRenderedContent: cachedEntry.preRenderedContent,
        },
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
        clientTrackByMap,
        usedPackages,
        linkedCssFiles,
        linkedComponentFiles,
    } = pagePartsResult.val;

    // Register linked files for watching (absolute paths from jay-html parser)
    _watchLinkedFiles([...(linkedCssFiles || []), ...(linkedComponentFiles || [])]);

    const pluginsForPage = filterPluginsForPage(
        allPluginClientInits,
        allPluginsWithInit,
        usedPackages,
    );

    // Run fast phase — includes instance fast render (DL#109)
    const instancePhaseData = (cachedEntry.carryForward as any)?.__instances as
        | InstancePhaseData
        | undefined;
    const forEachInstances = instancePhaseData?.forEachInstances;
    const headlessComps = pagePartsResult.val.headlessInstanceComponents;

    const fastStart = Date.now();
    const renderedFast = await renderFastChangingData(
        pageParams,
        pageProps,
        cachedEntry.carryForward,
        pageParts,
        instancePhaseData,
        forEachInstances,
        headlessComps,
        cachedEntry.slowViewState,
        query,
    );
    timing?.recordFastRender(Date.now() - fastStart);

    if (renderedFast.kind !== 'PhaseOutput') {
        handleOtherResponseCodes(res, renderedFast);
        timing?.end();
        return;
    }

    const fastViewState = renderedFast.rendered;
    const fastCarryForward = renderedFast.carryForward;

    // Head tags (DL#127): fast replaces slow entirely. If fast has none, use slow.
    const headTags =
        renderedFast.headTags ??
        mergeHeadTags((cachedEntry.carryForward as any)?.__slowHeadTags ?? []);

    // Only fast+interactive viewState (slow is baked into jay-html)
    // Use the pre-rendered file path so Vite compiles it
    // Pass slowViewState so automation can show full merged state
    await sendResponse(
        vite,
        res,
        url,
        cachedEntry.preRenderedPath,
        route.jayHtmlPath,
        pageParts,
        fastViewState,
        fastCarryForward,
        clientTrackByMap,
        projectInit,
        pluginsForPage,
        options,
        cachedEntry.slowViewState,
        timing,
        cachedEntry.preRenderedContent,
        headTags,
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
    query: Record<string, string> = {},
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

    // Register linked files for watching
    const { linkedCssFiles: initCss, linkedComponentFiles: initComps } = initialPartsResult.val;
    _watchLinkedFiles([...(initCss || []), ...(initComps || [])]);

    // Run slow phase to get slowViewState and carryForward
    // Includes key-based parts slow render + pre-render pipeline (instance slow render)
    const slowStart = Date.now();
    const renderedSlowly = await slowlyPhase.runSlowlyForPage(
        pageParams,
        pageProps,
        initialPartsResult.val.parts,
        undefined,
        undefined,
        route.jayHtmlPath,
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
    const partKeys = initialPartsResult.val.parts.map((p) => p.key).filter((k): k is string => !!k);
    const preRenderResult = await preRenderJayHtml(
        route,
        renderedSlowly.rendered,
        initialPartsResult.val.headlessContracts,
        initialPartsResult.val.headlessInstanceComponents,
        partKeys,
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

    // Cache the result (embeds metadata in file and writes to disk)
    const cachedEntry = await slowRenderCache.set(
        route.jayHtmlPath,
        pageParams,
        preRenderResult.preRenderedJayHtml,
        renderedSlowly.rendered,
        carryForward,
    );
    getLogger().info(`[SlowRender] Cached pre-rendered jay-html at ${cachedEntry.preRenderedPath}`);

    // Delegate to the cached handler — it loads parts from the pre-rendered file,
    // runs the fast phase (including instance fast render), and sends the response.
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
        query,
    );
}

/**
 * Handle request with SSR disabled (client-only rendering).
 * Runs slow+fast phases to compute viewState, then generates a client-only page
 * using generateClientScript (element target, no hydration).
 */
async function handleClientOnlyRequest(
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
    query: Record<string, string> = {},
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
        headlessInstanceComponents,
        discoveredInstances,
        forEachInstances,
        linkedCssFiles,
        linkedComponentFiles,
    } = pagePartsResult.val;

    // Register linked files for watching
    _watchLinkedFiles([...(linkedCssFiles || []), ...(linkedComponentFiles || [])]);

    const pluginsForPage = filterPluginsForPage(
        allPluginClientInits,
        allPluginsWithInit,
        usedPackages,
    );

    // Run slow phase (includes instance slow render — DL#109)
    const slowStart = Date.now();
    const renderedSlowly = await slowlyPhase.runSlowlyForPage(
        pageParams,
        pageProps,
        pageParts,
        discoveredInstances,
        headlessInstanceComponents,
        route.jayHtmlPath,
    );

    if (renderedSlowly.kind !== 'PhaseOutput') {
        timing?.recordSlowRender(Date.now() - slowStart);
        if (renderedSlowly.kind === 'ClientError') {
            handleOtherResponseCodes(res, renderedSlowly);
        }
        timing?.end();
        return;
    }
    timing?.recordSlowRender(Date.now() - slowStart);

    // Extract instance phase data from carryForward (set by runSlowlyForPage)
    const instancePhaseData = (renderedSlowly.carryForward as any)?.__instances as
        | InstancePhaseData
        | undefined;

    // Run fast phase (includes instance fast render — DL#109)
    const fastStart = Date.now();
    const renderedFast = await renderFastChangingData(
        pageParams,
        pageProps,
        renderedSlowly.carryForward,
        pageParts,
        instancePhaseData,
        forEachInstances,
        headlessInstanceComponents,
        renderedSlowly.rendered,
        query,
    );
    timing?.recordFastRender(Date.now() - fastStart);

    if (renderedFast.kind !== 'PhaseOutput') {
        handleOtherResponseCodes(res, renderedFast);
        timing?.end();
        return;
    }

    // Merge slow + fast viewState using deep merge (DL#108).
    const viewState: object = deepMergeViewStates(
        renderedSlowly.rendered,
        renderedFast.rendered,
        serverTrackByMap || {},
    );
    const fastCF = renderedFast.carryForward;

    // Generate client-only HTML (element target, no SSR/hydration)
    const pageHtml = await generateClientScript(
        viewState,
        fastCF,
        pageParts,
        route.jayHtmlPath,
        clientTrackByMap,
        getClientInitData(),
        projectInit,
        pluginsForPage,
        {
            enableAutomation: !options.disableAutomation,
        },
    );

    // Save generated page to build folder for debugging
    if (options.buildFolder) {
        const pageName = !url || url === '/' ? 'index' : url.replace(/^\//, '').replace(/\//g, '-');
        const clientScriptDir = path.join(options.buildFolder, 'debug', 'client-entry');
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
    sourceJayHtmlPath: string,
    pageParts: any[],
    viewState: object,
    carryForward: object,
    clientTrackByMap: Record<string, string> | undefined,
    projectInit: ProjectClientInitInfo | undefined,
    pluginsForPage: PluginClientInitInfo[],
    options: DevServerOptions,
    slowViewState?: object,
    timing?: RequestTiming,
    preLoadedContent?: string,
    headTags?: import('@jay-framework/fullstack-component').HeadTag[],
): Promise<void> {
    let pageHtml: string;

    const routeDir = path.dirname(path.relative(options.pagesRootFolder!, sourceJayHtmlPath));

    try {
        // Try SSR: server-render HTML + hydration script
        // Use pre-loaded content if available (from cache with tag already stripped)
        let jayHtmlContent = preLoadedContent ?? (await fs.readFile(jayHtmlPath, 'utf-8'));
        const jayHtmlFilename = path.basename(jayHtmlPath);
        const jayHtmlDir = path.dirname(jayHtmlPath);

        // Inject headfull FS templates using the ORIGINAL source directory for resolution.
        // The pre-rendered HTML may be in build/pre-rendered/, but contract and jay-html
        // files are relative to the original page location.
        const sourceDir = path.dirname(sourceJayHtmlPath);
        jayHtmlContent = injectHeadfullFSTemplates(jayHtmlContent, sourceDir, JAY_IMPORT_RESOLVER);

        pageHtml = await generateSSRPageHtml(
            vite,
            jayHtmlContent,
            jayHtmlFilename,
            jayHtmlDir,
            viewState,
            jayHtmlPath,
            pageParts,
            carryForward,
            clientTrackByMap,
            getClientInitData(),
            options.buildFolder!,
            options.projectRootFolder!,
            routeDir,
            options.jayRollupConfig?.tsConfigFilePath,
            projectInit,
            pluginsForPage,
            {
                enableAutomation: !options.disableAutomation,
                slowViewState,
            },
            // Pass source directory for headfull FS file resolution when using pre-rendered path
            jayHtmlDir !== sourceDir ? sourceDir : undefined,
            headTags,
        );
    } catch (err) {
        // Fall back to client-only rendering
        getLogger().warn(`[SSR] Failed, falling back to client rendering: ${err.message}`);
        pageHtml = await generateClientScript(
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
    }

    // Save generated page to build folder for debugging
    if (options.buildFolder) {
        const pageName = !url || url === '/' ? 'index' : url.replace(/^\//, '').replace(/\//g, '-');
        const clientScriptDir = path.join(options.buildFolder, 'debug', 'client-entry');
        await fs.mkdir(clientScriptDir, { recursive: true });
        await fs.writeFile(path.join(clientScriptDir, `${pageName}.html`), pageHtml, 'utf-8');
    }

    const viteStart = Date.now();
    const compiledPageHtml = await vite.transformIndexHtml(!!url ? url : '/', pageHtml);
    timing?.recordViteClient(Date.now() - viteStart);

    res.status(200).set({ 'Content-Type': 'text/html' }).send(compiledPageHtml);
    timing?.end();
}

// ============================================================================
// Frozen page rendering (DL#127)
// ============================================================================

/**
 * Handle a frozen page request — render SSR with a saved ViewState.
 * No component logic runs, no client scripts are included.
 */
async function handleFrozenRequest(
    vite: ViteDevServer,
    route: JayRoute,
    options: DevServerOptions,
    freezeStore: FreezeStore,
    slowRenderCache: SlowRenderCache,
    freezeId: string,
    pageParams: Record<string, string>,
    format: 'page' | 'fragment',
    res: Response,
    timing?: RequestTiming,
): Promise<void> {
    const entry = await freezeStore.get(freezeId);
    if (!entry) {
        getLogger().warn(`[Freeze] Freeze "${freezeId}" not found`);
        res.status(404).send(`Freeze "${freezeId}" not found`);
        timing?.end();
        return;
    }

    const label = entry.name ? `"${entry.name}" (${freezeId})` : freezeId;
    getLogger().info(`[Freeze] Serving frozen page ${label} for ${route.rawRoute} [${format}]`);

    try {
        // Use the pre-rendered jay-html (with slowForEach items unrolled)
        // so the server element sees the same structure as the client hydrate.
        // Fall back to the original jay-html if no pre-rendered version exists.
        const cachedEntry = await slowRenderCache.get(route.jayHtmlPath, pageParams);
        const jayHtmlPath = cachedEntry?.preRenderedPath ?? route.jayHtmlPath;
        const jayHtmlContent =
            cachedEntry?.preRenderedContent ?? (await fs.readFile(jayHtmlPath, 'utf-8'));
        const jayHtmlFilename = path.basename(jayHtmlPath);
        const jayHtmlDir = path.dirname(jayHtmlPath);
        const sourceDir = path.dirname(route.jayHtmlPath);
        const routeDir = path.dirname(path.relative(options.pagesRootFolder!, route.jayHtmlPath));

        // Inject headfull FS templates (component jay-html)
        const { injectHeadfullFSTemplates } = await import('@jay-framework/compiler-jay-html');
        const { JAY_IMPORT_RESOLVER } = await import('@jay-framework/compiler-jay-html');
        const fullJayHtml = injectHeadfullFSTemplates(
            jayHtmlContent,
            sourceDir,
            JAY_IMPORT_RESOLVER,
        );

        const html = await generateFrozenPageHtml(
            vite,
            fullJayHtml,
            jayHtmlFilename,
            jayHtmlDir,
            entry.viewState,
            options.buildFolder!,
            options.projectRootFolder!,
            routeDir,
            options.jayRollupConfig?.tsConfigFilePath,
            undefined,
            format,
            entry.name,
        );

        const headers: Record<string, string> = { 'Content-Type': 'text/html' };
        if (format === 'fragment') {
            headers['Access-Control-Allow-Origin'] = '*';
        }
        res.status(200).set(headers).send(html);
    } catch (err: any) {
        getLogger().warn(`[Freeze] Failed to render frozen page: ${err.message}`);
        res.status(500).send(`Failed to render frozen page: ${err.message}`);
    }
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
 * @param partKeys - Keys from keyed page parts (plugins), used to distinguish plugin data from page-level data
 */
async function preRenderJayHtml(
    route: JayRoute,
    slowViewState: object,
    headlessContracts: HeadlessContractInfo[],
    headlessInstanceComponents: HeadlessInstanceComponent[],
    partKeys: string[] = [],
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

    // Warn if slow data is provided without a contract (DL#108).
    // Without a contract, slow render resolves nothing — the data is silently ignored.
    // Skip warning when slowViewState only contains keyed part data (plugins) —
    // plugins have their own contracts and don't need the page-level contract.
    const hasPageLevelSlowData =
        slowViewState && Object.keys(slowViewState).some((k) => !partKeys.includes(k));
    if (!contract && hasPageLevelSlowData) {
        getLogger().warn(
            `[SlowRender] Page ${route.jayHtmlPath} has slow ViewState but no contract. ` +
                `Without a contract, slow bindings cannot be resolved. ` +
                `Move data to withFastRender or add a .jay-contract file with phase annotations.`,
        );
    }

    // Inject headfull FS component templates into the HTML before slow render.
    // This ensures instance bindings in headfull FS templates are resolved during pre-rendering,
    // just like inline templates in headless instances.
    const sourceDir = path.dirname(route.jayHtmlPath);
    const jayHtmlWithTemplates = injectHeadfullFSTemplates(
        jayHtmlContent,
        sourceDir,
        JAY_IMPORT_RESOLVER,
    );

    // ── Pass 1: Resolve page-level slow bindings ──
    const result = slowRenderTransform({
        jayHtmlContent: jayHtmlWithTemplates,
        slowViewState: slowViewState as Record<string, unknown>,
        contract,
        headlessContracts,
        sourceDir,
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
        // Discovery first (assigns ref attributes on <jay:xxx> tags), then coordinate
        // assignment reads those refs to produce consistent scoped coordinates (DL#126).
        const discoveryResult = discoverHeadlessInstances(preRenderedJayHtml);
        // Use the HTML with embedded ref attributes
        const htmlWithRefs = discoveryResult.preRenderedJayHtml;
        // Assign scoped coordinates — now jay-coordinate-base is set on all elements
        const headlessContractNameSet = new Set(
            headlessInstanceComponents.map((c) => c.contractName),
        );
        preRenderedJayHtml = assignCoordinatesToJayHtml(htmlWithRefs, headlessContractNameSet);
        // Re-discover to pick up the jay-coordinate-base values for key computation
        const finalDiscovery = discoverHeadlessInstances(preRenderedJayHtml);
        // Validate: forEach instances must not have slow phases
        if (finalDiscovery.forEachInstances.length > 0) {
            const validationErrors = validateForEachInstances(
                finalDiscovery.forEachInstances,
                headlessInstanceComponents,
            );
            if (validationErrors.length > 0) {
                getLogger().error(
                    `[SlowRender] ForEach instance validation failed: ${validationErrors.join(', ')}`,
                );
                return undefined;
            }
            forEachInstances = finalDiscovery.forEachInstances;
        }

        if (finalDiscovery.instances.length > 0) {
            const slowResult = await slowRenderInstances(
                finalDiscovery.instances,
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

            // Always populate instancePhaseData with all discovered instances (DL#109).
            // Even without slow data, instances need to be visible to the fast phase.
            if (!instancePhaseData) {
                const componentByContractName = new Map<string, HeadlessInstanceComponent>();
                for (const comp of headlessInstanceComponents) {
                    componentByContractName.set(comp.contractName, comp);
                }
                instancePhaseData = {
                    discovered: discoveryResult.instances
                        .filter((i) => componentByContractName.has(i.contractName))
                        .map((i) => {
                            const comp = componentByContractName.get(i.contractName)!;
                            const contractProps = comp.contract?.props ?? [];
                            const normalizedProps: Record<string, string> = {};
                            for (const [key, value] of Object.entries(i.props)) {
                                const match = contractProps.find(
                                    (p) => p.name.toLowerCase() === key.toLowerCase(),
                                );
                                normalizedProps[match ? match.name : key] = String(value);
                            }
                            return {
                                contractName: i.contractName,
                                props: normalizedProps,
                                coordinate: i.coordinate,
                            };
                        }),
                    carryForwards: {},
                };
            }
        }
    }

    return { preRenderedJayHtml, instancePhaseData, forEachInstances };
}

/**
 * Materializes dynamic contracts on dev server startup.
 * This allows AI agents to discover available contracts for page generation.
 */
async function materializeDynamicContracts(
    projectRootFolder: string,
    viteServer: ViteDevServer,
): Promise<void> {
    try {
        const services = getServiceRegistry();
        const result = await materializeContracts(
            {
                projectRoot: projectRootFolder,
                outputDir: path.join(projectRootFolder, 'agent-kit', 'materialized-contracts'),
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
    const { publicBaseUrlPath, pagesRootFolder, projectRootFolder, buildFolder, jayRollupConfig } =
        options;

    // Clean build folder on startup, preserving freezes/.
    // Server elements, CSS files, and pre-rendered cache all live here and go
    // stale when package code or jay-html templates change between restarts.
    // Frozen ViewState snapshots (build/freezes/) are preserved across restarts.
    if (buildFolder) {
        try {
            const entries = await fs.readdir(buildFolder).catch(() => []);
            for (const entry of entries) {
                if (entry === 'freezes') continue;
                await fs.rm(path.join(buildFolder, entry), { recursive: true, force: true });
            }
        } catch {
            // Build folder may not exist yet
        }
    }

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
        httpServer: options.httpServer,
    });

    // Set the Vite server and initialize services
    lifecycleManager.setViteServer(vite);
    await lifecycleManager.initialize();

    // Materialize dynamic contracts for agent discovery
    await materializeDynamicContracts(projectRootFolder!, vite);

    // Set up hot reload for lib/init.ts
    setupServiceHotReload(vite, lifecycleManager);

    // Set up action router for /_jay/actions/* endpoints
    setupActionRouter(vite);

    // Scan routes, excluding any page files found inside the build folder.
    // This prevents pre-rendered cache files from being picked up as additional routes
    // when the build folder is inside the pages root (e.g., in tests).
    const projectRoutes: JayRoutes = await initRoutes(pagesRootFolder);
    const filteredProjectRoutes = buildFolder
        ? projectRoutes.filter((route) => !route.jayHtmlPath.startsWith(buildFolder))
        : projectRoutes;

    // Scan plugin routes and merge — project routes take precedence (DL#130)
    const pluginRoutes = await scanPluginRoutes(projectRootFolder, filteredProjectRoutes);
    const routes = [...filteredProjectRoutes, ...pluginRoutes];
    const slowlyPhase = new DevSlowlyChangingPhase();

    // Create pre-rendered jay-html cache
    // Files are written to <buildFolder>/pre-rendered/
    const slowRenderCacheDir = path.join(buildFolder!, 'pre-rendered');
    const slowRenderCache = new SlowRenderCache(slowRenderCacheDir, pagesRootFolder);

    // Set up file watching for slow render cache invalidation.
    // Sets _watchLinkedFiles callback for registering CSS/component files after SSR.
    _watchLinkedFiles = setupSlowRenderCacheInvalidation(
        vite,
        slowRenderCache,
        pagesRootFolder,
        projectRootFolder,
    );

    // Get init info for embedding in generated pages
    const projectInit = lifecycleManager.getProjectInit() ?? undefined;
    const pluginsWithInit = lifecycleManager.getPluginsWithInit();
    const pluginClientInits = preparePluginClientInits(pluginsWithInit);

    // Set up page freeze (DL#127)
    const freezeStore = buildFolder ? new FreezeStore(buildFolder) : undefined;
    if (freezeStore) {
        setupFreezeEndpoint(vite, freezeStore);
    }

    const devServerRoutes: DevServerRoute[] = routes.map((route: JayRoute) =>
        mkRoute(
            route,
            vite,
            slowlyPhase,
            options,
            slowRenderCache,
            freezeStore,
            projectInit,
            pluginsWithInit,
            pluginClientInits,
        ),
    );

    const service = new DevServerService(devServerRoutes, vite, freezeStore);

    // Register as a Jay service so plugin actions/components can inject it (DL#130)
    registerService(DEV_SERVER_SERVICE, service);

    return {
        server: vite.middlewares,
        viteServer: vite,
        routes: devServerRoutes,
        lifecycleManager,
        freezeStore,
        service,
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
 * Sets up the freeze POST endpoint for saving ViewState snapshots (DL#127).
 */
function setupFreezeEndpoint(vite: ViteDevServer, freezeStore: FreezeStore): void {
    vite.middlewares.use((req: any, res: any, next: any) => {
        if (
            req.method === 'POST' &&
            (req.url === '/_jay/freeze' || req.originalUrl === '/_jay/freeze')
        ) {
            let body = '';
            req.on('data', (chunk: any) => (body += chunk));
            req.on('end', async () => {
                try {
                    const { route, viewState } = JSON.parse(body);
                    if (!route || !viewState) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing route or viewState' }));
                        return;
                    }
                    const entry = await freezeStore.save(route, viewState);
                    getLogger().info(`[Freeze] Saved freeze "${entry.id}" for ${route}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(entry));
                } catch (err: any) {
                    getLogger().warn(`[Freeze] Failed to save: ${err.message}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        } else {
            next();
        }
    });

    getLogger().info('[Freeze] Freeze endpoint mounted at /_jay/freeze');
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
    projectRootFolder: string,
): (files: string[]) => void {
    // Track watched files (CSS, component jay-html) to avoid re-adding.
    // Vite's root is pagesRootFolder (e.g., src/pages/), so files outside it
    // (src/styles/, src/components/) are invisible to the watcher unless
    // explicitly added with absolute paths.
    const watchedFiles = new Set<string>();

    /**
     * Register linked files for watching. Called after loadPageParts()
     * so we watch exactly the files referenced by jay-html pages.
     */
    const watchLinkedFiles = (files: string[]) => {
        for (const file of files) {
            if (watchedFiles.has(file)) continue;
            watchedFiles.add(file);
            vite.watcher.add(file);
            getLogger().info(`[SlowRender] Watching: ${file}`);
        }
    };

    vite.watcher.on('change', (changedPath) => {
        // CSS or component files linked from jay-html.
        // CSS content is inlined in the SSR output; component jay-html templates
        // are injected into pages. Both require cache invalidation on change.
        if (watchedFiles.has(changedPath)) {
            clearServerElementCache();
            cache.clear().then(() => {
                getLogger().info(
                    `[SlowRender] Cache cleared (linked file changed: ${changedPath})`,
                );
                vite.ws.send({ type: 'full-reload' });
            });
            return;
        }

        // Page jay-html files inside the pages folder
        if (changedPath.endsWith('.jay-html') && changedPath.startsWith(pagesRootFolder)) {
            clearServerElementCache();
            cache.clear().then(() => {
                getLogger().info(`[SlowRender] Cache cleared (jay-html changed: ${changedPath})`);
                vite.ws.send({ type: 'full-reload' });
            });
            return;
        }

        // Only process remaining file types in the pages folder
        if (!changedPath.startsWith(pagesRootFolder)) {
            return;
        }

        // Invalidate cache for page.ts changes (component code affects slow render)
        if (changedPath.endsWith('page.ts')) {
            // The jay-html is in the same directory as page.ts
            const dir = path.dirname(changedPath);
            const jayHtmlPath = path.join(dir, 'page.jay-html');
            clearServerElementCache();
            cache.invalidate(jayHtmlPath).then(() => {
                getLogger().info(
                    `[SlowRender] Cache invalidated for ${jayHtmlPath} (page.ts changed)`,
                );
                vite.ws.send({ type: 'full-reload' });
            });
            return;
        }

        // Invalidate cache for contract changes
        if (changedPath.endsWith('.jay-contract')) {
            // The jay-html has the same name as the contract
            const jayHtmlPath = changedPath.replace('.jay-contract', '.jay-html');
            clearServerElementCache();
            cache.invalidate(jayHtmlPath).then(() => {
                getLogger().info(
                    `[SlowRender] Cache invalidated for ${jayHtmlPath} (contract changed)`,
                );
                vite.ws.send({ type: 'full-reload' });
            });
            return;
        }
    });

    return watchLinkedFiles;
}
