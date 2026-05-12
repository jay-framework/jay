import type { BuildOptions, BuildMetadata, RouteManifest } from '../types';
import { discoverServerEntries, buildServerCode } from './server-code-build';
import { buildSharedChunks } from './shared-chunks-build';
import { buildInstance, type InstanceBuildContext } from './instance-pipeline';
import { loadProductionPageParts } from './load-production-parts';
import { buildRouteEntry, discoverActions, writeRouteManifest } from './route-manifest';
import { scanPluginRoutes } from './plugin-routes';
import { runLoadParams, type DevServerPagePart } from '@jay-framework/stack-server-runtime';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

export async function buildVersion(options: BuildOptions): Promise<RouteManifest> {
    const logger = getLogger();
    const buildDir = path.join(options.buildRoot, `v${options.version}`);

    logger.important(`[Build] Starting production build v${options.version}`);
    logger.important(`[Build] Project: ${options.projectRoot}`);

    await fs.mkdir(buildDir, { recursive: true });

    // ── Phase 0: Shared Artifacts ──

    // 0a. Discover entries + scan routes
    const { entries, routes } = await discoverServerEntries(
        options.projectRoot,
        options.pagesRoot,
    );

    // 0b. Compile server code (Vite SSR build)
    const serverOutputDir = path.join(buildDir, 'server');
    await buildServerCode(
        entries,
        { tsConfigFilePath: options.tsConfigFilePath },
        serverOutputDir,
        options.projectRoot,
    );

    // 0c. Build shared client chunks
    const sharedOutputDir = path.join(buildDir, 'shared');
    const { manifest: sharedManifest } = await buildSharedChunks(
        sharedOutputDir,
        options.projectRoot,
        options.minify ?? true,
    );

    // 0d. Discover actions for manifest
    const { actions, plugins } = await discoverActions(entries.actions, serverOutputDir, buildDir, options.projectRoot);

    // 0e. Initialize services (needed for slow render)
    // Run plugin inits in dependency order (plugins register services used by other plugins and pages)
    const { discoverPluginsWithInit, sortPluginsByDependencies } = await import('@jay-framework/stack-server-runtime');
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

    const instanceCtx: InstanceBuildContext = {
        projectRoot: options.projectRoot,
        buildDir,
        jayOptions: { tsConfigFilePath: options.tsConfigFilePath },
        tsConfigFilePath: options.tsConfigFilePath,
        minify: options.minify ?? true,
    };

    // 0f. Discover plugin routes
    const pluginRoutes = await scanPluginRoutes(options.projectRoot, routes);

    const allRoutes = [...routes, ...pluginRoutes];

    const routeEntries = allRoutes.map((route) => {
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

    for (const { route, entry } of routeEntries) {
        let pageModule: any = {};
        if (entry.serverModule) {
            try {
                if (entry.isPlugin) {
                    pageModule = await import(entry.serverModule);
                } else {
                    const pageModulePath = path.join(serverOutputDir, entry.serverModule.replace('server/', ''));
                    pageModule = await import(pageModulePath);
                }
            } catch (err) {
                logger.error(`[Build] Failed to load page module ${entry.serverModule}: ${err}`);
                continue;
            }
        }

        const compDefinition = pageModule.page ?? pageModule.default ?? undefined;
        const hasDynamicParams = route.segments.some((s) => typeof s !== 'string');

        // Static override routes (e.g., /products/ceramic-flower-vase) have inferred params
        const inferredParams = (route as any).inferredParams;
        if (inferredParams) {
            try {
                const result = await buildInstance(route, inferredParams, pageModule, instanceCtx);
                entry.instances.push(result.instanceEntry);
                instanceCount++;
            } catch (err: any) {
                logger.error(`[Build] Failed to build ${route.rawRoute}: ${err.message}`);
            }
            continue;
        }

        if (hasDynamicParams) {
            // Check page component and keyed headless parts for loadParams
            const pageParts = await loadProductionPageParts(
                route, pageModule, await fs.readFile(route.jayHtmlPath, 'utf-8'),
                options.projectRoot, options.tsConfigFilePath,
                path.join(buildDir, 'server'),
            );
            const partsWithLoadParams = pageParts.parts.filter(p => p.compDefinition?.loadParams);

            if (partsWithLoadParams.length > 0) {
                const allParams: Record<string, string>[] = [];
                for await (const batch of runLoadParams(partsWithLoadParams)) {
                    allParams.push(...batch);
                }
                logger.info(`[Build] Route ${route.rawRoute}: ${allParams.length} param combinations`);

                for (const params of allParams) {
                    try {
                        const result = await buildInstance(route, params, pageModule, instanceCtx);
                        entry.instances.push(result.instanceEntry);
                        instanceCount++;
                    } catch (err: any) {
                        logger.error(`[Build] Failed to build ${route.rawRoute} with params ${JSON.stringify(params)}: ${err.message}`);
                    }
                }
            } else {
                logger.info(`[Build] Skipping dynamic route ${route.rawRoute} — no loadParams available`);
            }
        } else {
            try {
                const result = await buildInstance(route, {}, pageModule, instanceCtx);
                entry.instances.push(result.instanceEntry);
                instanceCount++;
            } catch (err: any) {
                logger.error(`[Build] Failed to build ${route.rawRoute}: ${err.message}`);
            }
        }
    }

    // ── Phase 2: Finalize ──

    const manifest: RouteManifest = {
        version: options.version,
        buildTimestamp: new Date().toISOString(),
        sourceHash: '',
        projectRoot: options.projectRoot,
        publicBasePath: options.publicBasePath,
        sharedManifest,
        routes: routeEntries.map((r) => r.entry),
        actions,
        plugins,
    };

    await writeRouteManifest(manifest, buildDir);

    const metadata: BuildMetadata = {
        version: options.version,
        sourceHash: '',
        buildTimestamp: manifest.buildTimestamp,
        nodeVersion: process.version,
        instanceCount,
    };
    await fs.writeFile(
        path.join(buildDir, 'build-metadata.json'),
        JSON.stringify(metadata, null, 2),
    );

    logger.important(`[Build] Done! ${instanceCount} instances built in ${buildDir}`);

    return manifest;
}
