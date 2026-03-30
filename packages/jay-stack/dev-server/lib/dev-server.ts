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
import { RequestHandler } from 'express-serve-static-core';
import { renderFastChangingData } from '@jay-framework/stack-server-runtime';
import { loadPageParts } from '@jay-framework/stack-server-runtime';
import {
    generateClientScript,
    generateSSRPageHtml,
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
        disableSSR: options.disableSSR,
        jayRollupConfig: {
            ...(options.jayRollupConfig || {}),
            tsConfigFilePath,
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

    const { parts: pageParts, clientTrackByMap, usedPackages } = pagePartsResult.val;

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
    } = pagePartsResult.val;

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
    const pageHtml = generateClientScript(
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
        );
    } catch (err) {
        // Fall back to client-only rendering
        getLogger().warn(`[SSR] Failed, falling back to client rendering: ${err.message}`);
        pageHtml = generateClientScript(
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

    // Warn if slow data is provided without a contract (DL#108).
    // Without a contract, slow render resolves nothing — the data is silently ignored.
    if (!contract && slowViewState && Object.keys(slowViewState).length > 0) {
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

    // Clean build folder on startup, but preserve pre-rendered cache (DL#110).
    // The pre-rendered/ directory contains filesystem-based cache entries that
    // survive restarts, so first requests don't re-run the slow render pipeline.
    if (buildFolder) {
        try {
            const entries = await fs.readdir(buildFolder);
            for (const entry of entries) {
                if (entry !== 'pre-rendered') {
                    await fs
                        .rm(path.join(buildFolder, entry), { recursive: true, force: true })
                        .catch(() => {});
                }
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
    const allRoutes: JayRoutes = await initRoutes(pagesRootFolder);
    const routes = buildFolder
        ? allRoutes.filter((route) => !route.jayHtmlPath.startsWith(buildFolder))
        : allRoutes;
    const slowlyPhase = new DevSlowlyChangingPhase();

    // Create pre-rendered jay-html cache
    // Files are written to <buildFolder>/pre-rendered/
    const slowRenderCacheDir = path.join(buildFolder!, 'pre-rendered');
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
            clearServerElementCache();
            cache.invalidate(changedPath).then(() => {
                getLogger().info(`[SlowRender] Cache invalidated for ${changedPath}`);
                vite.ws.send({ type: 'full-reload' });
            });
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
}
