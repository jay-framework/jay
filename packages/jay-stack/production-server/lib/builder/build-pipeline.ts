import type { BuildOptions, BuildMetadata, RouteManifest, RouteEntry } from '../types';
import { discoverServerEntries, buildServerCode } from './server-code-build';
import { buildSharedChunks } from './shared-chunks-build';
import { buildInstance, type InstanceBuildContext } from './instance-pipeline';
import { loadProductionPageParts } from './load-production-parts';
import { buildRouteEntry, discoverActions, writeRouteManifest } from './route-manifest';
import { scanPluginRoutes } from './plugin-routes';
import { compileRouteServerElement, compileRouteHydrateScript } from './server-element-compile';
import { generateRouteHydrationEntry } from './hydration-entry-gen';
import { buildInstanceClient } from './instance-client-build';
import { runLoadParams } from '@jay-framework/stack-server-runtime';
import {
    crossProductParams,
    materializeRouteParams,
    dedupeByUrl,
    type RouteInfo,
    type ParamPart,
} from './param-routing';
import { getLogger } from '@jay-framework/logger';
import { JayRouteParamType, type JayRoute } from '@jay-framework/stack-route-scanner';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';

interface BuildRouteEntry {
    route: JayRoute;
    entry: RouteEntry;
}

interface BuildRouteInfo extends RouteInfo {
    routeEntry: BuildRouteEntry;
}

async function discoverPluginClientPackages(projectRoot: string): Promise<string[]> {
    const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
    const seen = new Set<string>();
    const result: string[] = [];

    async function walk(pkgName: string) {
        if (seen.has(pkgName)) return;
        seen.add(pkgName);
        try {
            const mainPath = projectRequire.resolve(pkgName);
            let pkgDir = path.dirname(mainPath);
            while (pkgDir !== path.dirname(pkgDir)) {
                const candidate = path.join(pkgDir, 'package.json');
                try {
                    const pkgJson = JSON.parse(await fs.readFile(candidate, 'utf-8'));
                    if (pkgJson.name === pkgName) {
                        if (pkgJson.exports?.['./client']) {
                            result.push(`${pkgName}/client`);
                        }
                        for (const dep of Object.keys(pkgJson.dependencies || {})) {
                            if (dep.startsWith('@jay-framework/')) {
                                await walk(dep);
                            }
                        }
                        break;
                    }
                } catch {
                    /* no package.json at this level */
                }
                pkgDir = path.dirname(pkgDir);
            }
        } catch {
            /* not resolvable */
        }
    }

    try {
        const projectPkg = JSON.parse(
            await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'),
        );
        const allDeps = {
            ...projectPkg.dependencies,
            ...projectPkg.devDependencies,
        };
        for (const dep of Object.keys(allDeps)) {
            if (dep.startsWith('@jay-framework/')) {
                await walk(dep);
            }
        }
    } catch {
        /* no package.json */
    }

    return result;
}

export async function buildVersion(options: BuildOptions): Promise<RouteManifest> {
    const logger = getLogger();
    const buildDir = path.join(options.buildRoot, `v${options.version}`);
    const backendDir = path.join(buildDir, 'backend');
    const frontendDir = path.join(buildDir, 'frontend');

    logger.important(`[Build] Starting production build v${options.version}`);
    logger.important(`[Build] Project: ${options.projectRoot}`);

    await fs.mkdir(backendDir, { recursive: true });
    await fs.mkdir(frontendDir, { recursive: true });

    // ── Phase 0: Shared Artifacts ──

    // 0a. Discover entries + scan routes
    const { entries, routes } = await discoverServerEntries(options.projectRoot, options.pagesRoot);

    // 0b. Compile server code (Vite SSR build) → backend/server/
    const serverOutputDir = path.join(backendDir, 'server');
    await buildServerCode(
        entries,
        { tsConfigFilePath: options.tsConfigFilePath },
        serverOutputDir,
        options.projectRoot,
    );

    // 0c. Discover plugin client packages for shared chunks (project deps + transitive)
    const pluginClientPackages = await discoverPluginClientPackages(options.projectRoot);
    if (pluginClientPackages.length > 0) {
        logger.important(`[Build] Plugin client packages: ${pluginClientPackages.join(', ')}`);
    }

    // 0d. Build shared client chunks → frontend/shared/
    const sharedOutputDir = path.join(frontendDir, 'shared');
    const { manifest: sharedManifest } = await buildSharedChunks(
        sharedOutputDir,
        options.projectRoot,
        options.minify ?? true,
        pluginClientPackages,
    );

    // 0d. Discover actions for manifest
    const { actions, plugins } = await discoverActions(
        entries.actions,
        serverOutputDir,
        backendDir,
        options.projectRoot,
    );

    // 0e. Initialize services (needed for slow render)
    // Run plugin inits in dependency order (plugins register services used by other plugins and pages)
    const { discoverPluginsWithInit, sortPluginsByDependencies } = await import(
        '@jay-framework/stack-server-runtime'
    );
    try {
        const pluginsWithInit = sortPluginsByDependencies(
            await discoverPluginsWithInit({ projectRoot: options.projectRoot }),
        );
        for (const pluginInit of pluginsWithInit) {
            try {
                const pluginModule = await import(pluginInit.packageName);
                const init = pluginModule.init || pluginModule[pluginInit.initExport || 'init'];
                if (init?._serverInit) {
                    logger.info(`[Build] Running plugin init: ${pluginInit.name}`);
                    await init._serverInit();
                }
            } catch (err: any) {
                logger.warn(`[Build] Plugin init failed: ${pluginInit.name}: ${err.message}`);
            }
        }
    } catch {
        // No plugins with init
    }
    // Then run project init
    if (entries.init) {
        const initModulePath = path.join(serverOutputDir, 'init.js');
        try {
            const initModule = await import(initModulePath);
            const init = initModule.init || initModule.default;
            if (init?._serverInit) {
                logger.info('[Build] Running server init...');
                await init._serverInit();
            }
        } catch (err) {
            logger.error(`[Build] Failed to run init: ${err}`);
            throw err;
        }
    }

    // ── Phase 1: Per-Instance Pipeline ──

    // Discover client inits for hydration entries (plugins + project)
    const clientInits: InstanceBuildContext['clientInits'] = [];
    // Plugin client inits — check which plugins have _clientInit by loading them
    try {
        const allPluginsWithInit = sortPluginsByDependencies(
            await discoverPluginsWithInit({ projectRoot: options.projectRoot }),
        );
        for (const pluginInit of allPluginsWithInit) {
            if (pluginInit.isLocal) continue;
            const clientImportPath = `${pluginInit.packageName}/client`;
            try {
                const clientModule = await import(clientImportPath);
                const init = clientModule[pluginInit.initExport || 'init'] || clientModule.init;
                if (init?._clientInit) {
                    clientInits.push({
                        modulePath: clientImportPath,
                        exportName: pluginInit.initExport || 'init',
                        key: pluginInit.name,
                    });
                }
            } catch {
                /* plugin may not have /client entry or init */
            }
        }
    } catch (err: any) {
        logger.warn(`[Build] Client init discovery failed: ${err.message}`);
    }
    if (clientInits.length > 0) {
        logger.important(`[Build] Client inits: ${clientInits.map((ci) => ci.key).join(', ')}`);
    }
    // Project init — use the source path (Vite will compile it during instance build)
    if (entries.init) {
        clientInits.push({
            modulePath: entries.init,
            exportName: 'init',
            key: 'project',
        });
    }

    const instanceCtx: InstanceBuildContext = {
        projectRoot: options.projectRoot,
        pagesRoot: options.pagesRoot,
        buildDir,
        backendDir,
        frontendDir,
        jayOptions: { tsConfigFilePath: options.tsConfigFilePath },
        tsConfigFilePath: options.tsConfigFilePath,
        minify: options.minify ?? true,
        clientInits,
    };

    // 0f. Discover plugin routes
    const pluginRoutes = await scanPluginRoutes(options.projectRoot, routes);

    const allRoutes = [...routes, ...pluginRoutes];

    const routeEntries: BuildRouteEntry[] = allRoutes.map((route) => {
        let serverModule: string = '';
        if (route.compPath) {
            if (route.componentExport) {
                serverModule = route.compPath;
            } else {
                const relativePath = path.relative(options.projectRoot, route.compPath);
                serverModule = relativePath
                    .replace(/^src\//, 'server/')
                    .replace(/\.ts$/, '.js')
                    .replace(/\[/g, '_')
                    .replace(/\]/g, '_');
            }
        }
        const entry = buildRouteEntry(route, serverModule);
        if (route.componentExport) {
            entry.isPlugin = true;
        }
        return { route, entry };
    });

    let instanceCount = 0;
    let totalExpected = 0;

    function logInstance(routeName: string, params: Record<string, string>) {
        instanceCount++;
        const paramStr =
            Object.keys(params).length > 0
                ? ` (${Object.entries(params)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(', ')})`
                : '';
        logger.important(`[Build] ${instanceCount}/${totalExpected} ${routeName}${paramStr}`);
    }

    async function loadPageModule(entry: RouteEntry): Promise<Record<string, unknown>> {
        if (!entry.serverModule) return {};
        if (entry.isPlugin) return import(entry.serverModule);
        return import(path.join(backendDir, entry.serverModule));
    }

    // ── Step 1: Collect loadParams (run each unique one once) ──

    const routeInfos: BuildRouteInfo[] = routeEntries.map((re) => {
        const optionalNames = re.route.segments
            .filter((s) => typeof s !== 'string' && s.type === JayRouteParamType.optional)
            .map((s) => (s as { name: string }).name);
        return {
            rawRoute: re.route.rawRoute,
            inferredParams: re.route.inferredParams,
            optionalSegments: optionalNames.length > 0 ? new Set(optionalNames) : undefined,
            hasDynamicParams: re.route.segments.some((s) => typeof s !== 'string'),
            routeEntry: re,
        };
    });

    type LoadParamsFn = (...args: unknown[]) => AsyncIterable<Record<string, string>[]>;
    const loadParamsCache = new Map<LoadParamsFn, Record<string, string>[]>();
    const loadParamsResults = new Map<BuildRouteInfo, Record<string, string>[]>();

    for (const info of routeInfos) {
        if (!info.hasDynamicParams) continue;
        const { route, entry } = info.routeEntry;

        let pageModule: Record<string, unknown>;
        try {
            pageModule = await loadPageModule(entry);
        } catch (err) {
            logger.error(`[Build] Failed to load page module ${entry.serverModule}: ${err}`);
            continue;
        }

        const pageParts = await loadProductionPageParts(
            route,
            pageModule,
            await fs.readFile(route.jayHtmlPath, 'utf-8'),
            options.projectRoot,
            options.tsConfigFilePath,
            serverOutputDir,
        );
        const partsWithLoadParams = pageParts.parts.filter((p) => p.compDefinition?.loadParams);
        if (partsWithLoadParams.length === 0) continue;

        const paramParts: ParamPart[] = [];
        for (const part of partsWithLoadParams) {
            const fn = part.compDefinition!.loadParams! as LoadParamsFn;
            if (!loadParamsCache.has(fn)) {
                logger.important(`[Build] Loading params for ${route.rawRoute}...`);
                const partParams: Record<string, string>[] = [];
                let batchIndex = 0;
                for await (const batch of runLoadParams([part])) {
                    partParams.push(...batch);
                    batchIndex++;
                    if (batchIndex > 1) {
                        logger.important(`[Build]   ...${partParams.length} params so far`);
                    }
                }
                loadParamsCache.set(fn, partParams);
            }
            const cached = loadParamsCache.get(fn)!;
            const keys = new Set(cached.flatMap((p) => Object.keys(p)));
            paramParts.push({ keys, values: cached });
        }

        loadParamsResults.set(info, crossProductParams(paramParts));
    }

    // ── Step 2: Materialize all route+params combinations ──

    const materialized = materializeRouteParams(routeInfos, loadParamsResults);

    // ── Step 3: Dedupe by URL ──

    const deduped = dedupeByUrl(materialized);
    totalExpected = deduped.length;

    const byRoute = new Map<BuildRouteInfo, Record<string, string>[]>();
    for (const materialized of deduped) {
        const info = materialized.route as BuildRouteInfo;
        if (!byRoute.has(info)) byRoute.set(info, []);
        byRoute.get(info)!.push(materialized.params);
    }

    // ── Step 3b: Compile per-route server elements (DL#144) ──

    for (const [info] of byRoute) {
        const { route, entry } = info.routeEntry;
        if (!route.jayHtmlPath) continue;

        const routeDir = route.rawRoute.replace(/^\//, '') || 'index';
        const frontendSafeRouteDir = routeDir.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
        const backendRouteDir = path.join(backendDir, 'pre-rendered', routeDir);
        const frontendRouteDir = path.join(frontendDir, 'pages', frontendSafeRouteDir);
        await fs.mkdir(backendRouteDir, { recursive: true });
        await fs.mkdir(frontendRouteDir, { recursive: true });

        const serverElementPath = path.join(backendRouteDir, 'route.server-element.js');
        try {
            const seResult = await compileRouteServerElement(
                route.jayHtmlPath,
                serverElementPath,
                options.projectRoot,
                options.tsConfigFilePath,
            );
            entry.serverElementPath = path.relative(backendDir, serverElementPath);

            if (seResult.cssFile) {
                const srcCss = path.join(backendRouteDir, seResult.cssFile);
                const dstCss = path.join(frontendRouteDir, seResult.cssFile);
                try {
                    await fs.rename(srcCss, dstCss);
                } catch {
                    await fs.copyFile(srcCss, dstCss);
                    await fs.rm(srcCss, { force: true });
                }
                entry.routeCssPath = path.relative(frontendDir, dstCss);
            }

            logger.important(`[Build] Route server element: ${routeDir}`);
        } catch (err: any) {
            logger.error(`[Build] Route server element FAILED ${route.rawRoute}: ${err.message}`);
        }

        try {
            const hydrateResult = await compileRouteHydrateScript(
                route.jayHtmlPath,
                frontendRouteDir,
                options.projectRoot,
                options.tsConfigFilePath,
                options.minify ?? true,
            );
            entry.routeHydratePath = path.relative(
                frontendDir,
                path.join(frontendRouteDir, hydrateResult.jsFile),
            );
            logger.important(`[Build] Route hydrate script: ${routeDir}`);
        } catch (err: any) {
            logger.error(`[Build] Route hydrate script FAILED ${route.rawRoute}: ${err.message}`);
            continue;
        }

        // Compile per-route client bundle (hydrate entry + route hydrate script)
        try {
            const ROUTE_HYDRATE_KEY = 'jay-route-hydrate';
            const exportName = (route as any).componentExport || 'page';
            let pageModulePath = '';
            if (route.compPath) {
                if (route.componentExport) {
                    const pkgName = route.packageName || route.compPath;
                    pageModulePath = `${pkgName}/client`;
                } else {
                    pageModulePath = './' + path.relative(frontendRouteDir, route.compPath);
                }
            }

            const pageParts = await loadProductionPageParts(
                route,
                {},
                await fs.readFile(route.jayHtmlPath, 'utf-8'),
                options.projectRoot,
                options.tsConfigFilePath,
                path.join(backendDir, 'server'),
            );

            const entryPath = path.join(frontendRouteDir, 'route.entry.ts');
            await generateRouteHydrationEntry({
                hydrateImport: ROUTE_HYDRATE_KEY,
                pageModulePath,
                pageExportName: exportName,
                trackByMap: pageParts.clientTrackByMap || {},
                outputPath: entryPath,
                keyedParts: pageParts.keyedPartModules,
                clientInits,
            });

            const clientResult = await buildInstanceClient(
                entryPath,
                'route.client',
                frontendRouteDir,
                options.projectRoot,
                { tsConfigFilePath: options.tsConfigFilePath },
                options.minify ?? true,
                options.pagesRoot,
                buildDir,
            );
            await fs.rm(entryPath, { force: true });

            entry.routeClientBundlePath = path.relative(
                frontendDir,
                path.join(frontendRouteDir, clientResult.jsFile),
            );
            logger.important(`[Build] Route client bundle: ${routeDir}`);
        } catch (err: any) {
            logger.error(`[Build] Route client bundle FAILED ${route.rawRoute}: ${err.message}`);
        }
    }

    // ── Step 4: Build ──

    for (const [info, paramsList] of byRoute) {
        const { route, entry } = info.routeEntry;

        let pageModule: Record<string, unknown>;
        try {
            pageModule = await loadPageModule(entry);
        } catch (err) {
            logger.error(`[Build] Failed to load page module ${entry.serverModule}: ${err}`);
            continue;
        }

        if (paramsList.length > 1 || info.hasDynamicParams) {
            logger.important(
                `[Build] Route ${route.rawRoute}: ${paramsList.length} param combinations`,
            );
        }

        for (const params of paramsList) {
            try {
                const result = await buildInstance(
                    route,
                    params,
                    pageModule,
                    instanceCtx,
                    entry.serverElementPath,
                    entry.routeCssPath,
                    entry.routeHydratePath,
                    entry.routeClientBundlePath,
                );
                if (result.status === 'success') {
                    entry.instances.push(result.instanceEntry);
                    if (result.contracts.length > 0 && !entry.contracts) {
                        entry.contracts = result.contracts;
                    }
                    logInstance(route.rawRoute || '/', params);
                } else {
                    logger.warn(
                        `[Build] Skipped ${route.rawRoute} (${JSON.stringify(params)}): ${result.reason}`,
                    );
                    totalExpected--;
                }
            } catch (err: any) {
                instanceCount++;
                logger.error(
                    `[Build] ${instanceCount}/${totalExpected} FAILED ${route.rawRoute || '/'} (${JSON.stringify(params)}): ${err.message}`,
                );
            }
        }
    }

    // ── Phase 2: Finalize ──

    const manifest: RouteManifest = {
        version: options.version,
        buildTimestamp: new Date().toISOString(),
        sourceHash: '',
        projectRoot: options.projectRoot,
        sharedManifest,
        routes: routeEntries.map((r) => r.entry),
        actions,
        plugins,
    };

    await writeRouteManifest(manifest, backendDir);

    const metadata: BuildMetadata = {
        version: options.version,
        sourceHash: '',
        buildTimestamp: manifest.buildTimestamp,
        nodeVersion: process.version,
        instanceCount,
    };
    await fs.writeFile(
        path.join(backendDir, 'build-metadata.json'),
        JSON.stringify(metadata, null, 2),
    );

    // Copy public folder to frontend/
    const publicFolder = path.join(options.projectRoot, 'public');
    try {
        await fs.access(publicFolder);
        await fs.cp(publicFolder, path.join(frontendDir, 'public'), { recursive: true });
        logger.info('[Build] Copied public/ to frontend/public/');
    } catch {
        // No public folder — skip
    }

    logger.important(`[Build] Done! ${instanceCount} instances built in ${buildDir}`);

    return manifest;
}
