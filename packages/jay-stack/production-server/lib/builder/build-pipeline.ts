import type { BuildOptions, BuildMetadata, RouteManifest } from '../types';
import { discoverServerEntries, buildServerCode } from './server-code-build';
import { buildSharedChunks } from './shared-chunks-build';
import { buildInstance, type InstanceBuildContext } from './instance-pipeline';
import { loadProductionPageParts } from './load-production-parts';
import { buildRouteEntry, discoverActions, writeRouteManifest } from './route-manifest';
import { scanPluginRoutes } from './plugin-routes';
import { runLoadParams, type DevServerPagePart } from '@jay-framework/stack-server-runtime';
import { getLogger } from '@jay-framework/logger';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);

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
                } catch { /* no package.json at this level */ }
                pkgDir = path.dirname(pkgDir);
            }
        } catch { /* not resolvable */ }
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
    } catch { /* no package.json */ }

    return result;
}

export async function buildVersion(options: BuildOptions): Promise<RouteManifest> {
    const logger = getLogger();
    const buildDir = path.join(options.buildRoot, `v${options.version}`);

    logger.important(`[Build] Starting production build v${options.version}`);
    logger.important(`[Build] Project: ${options.projectRoot}`);

    await fs.mkdir(buildDir, { recursive: true });

    // ── Phase 0: Shared Artifacts ──

    // 0a. Discover entries + scan routes
    const { entries, routes } = await discoverServerEntries(options.projectRoot, options.pagesRoot);

    // 0b. Compile server code (Vite SSR build)
    const serverOutputDir = path.join(buildDir, 'server');
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

    // 0d. Build shared client chunks
    const sharedOutputDir = path.join(buildDir, 'shared');
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
        buildDir,
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
        jayOptions: { tsConfigFilePath: options.tsConfigFilePath },
        tsConfigFilePath: options.tsConfigFilePath,
        minify: options.minify ?? true,
        clientInits,
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
    let totalExpected = 0;

    // Count static routes for initial estimate
    for (const { route } of routeEntries) {
        const hasDynamic = route.segments.some((s) => typeof s !== 'string');
        const hasInferred = !!(route as any).inferredParams;
        if (!hasDynamic || hasInferred) totalExpected++;
    }

    function logInstance(route: string, params: Record<string, string>) {
        instanceCount++;
        const paramStr =
            Object.keys(params).length > 0
                ? ` (${Object.entries(params)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(', ')})`
                : '';
        logger.important(`[Build] ${instanceCount}/${totalExpected} ${route}${paramStr}`);
    }

    for (const { route, entry } of routeEntries) {
        let pageModule: any = {};
        if (entry.serverModule) {
            try {
                if (entry.isPlugin) {
                    pageModule = await import(entry.serverModule);
                } else {
                    const pageModulePath = path.join(
                        serverOutputDir,
                        entry.serverModule.replace('server/', ''),
                    );
                    pageModule = await import(pageModulePath);
                }
            } catch (err) {
                logger.error(`[Build] Failed to load page module ${entry.serverModule}: ${err}`);
                continue;
            }
        }

        const compDefinition = pageModule.page ?? pageModule.default ?? undefined;
        const hasDynamicParams = route.segments.some((s) => typeof s !== 'string');

        const inferredParams: Record<string, string> | undefined = (route as any).inferredParams;

        if (inferredParams && !hasDynamicParams) {
            // Fully-specified static override (e.g., /products/ceramic-flower-vase)
            try {
                const result = await buildInstance(route, inferredParams, pageModule, instanceCtx);
                if (result.status === 'success') {
                    entry.instances.push(result.instanceEntry);
                    logInstance(route.rawRoute, inferredParams);
                } else {
                    logger.warn(`[Build] Skipped ${route.rawRoute} (${JSON.stringify(inferredParams)}): ${result.reason}`);
                }
            } catch (err: any) {
                logger.error(`[Build] Failed to build ${route.rawRoute} (${JSON.stringify(inferredParams)}): ${err.message}`);
            }
            continue;
        }

        if (hasDynamicParams) {
            const pageParts = await loadProductionPageParts(
                route,
                pageModule,
                await fs.readFile(route.jayHtmlPath, 'utf-8'),
                options.projectRoot,
                options.tsConfigFilePath,
                path.join(buildDir, 'server'),
            );
            const partsWithLoadParams = pageParts.parts.filter((p) => p.compDefinition?.loadParams);

            if (partsWithLoadParams.length > 0) {
                logger.important(`[Build] Loading params for ${route.rawRoute}...`);
                const allParams: Record<string, string>[] = [];
                let batchIndex = 0;
                for await (const batch of runLoadParams(partsWithLoadParams)) {
                    allParams.push(...batch);
                    batchIndex++;
                    if (batchIndex > 1) {
                        logger.important(`[Build]   ...${allParams.length} params so far`);
                    }
                }
                // Merge inferred params (e.g., prefix) into each loadParams result
                if (inferredParams) {
                    for (const p of allParams) {
                        Object.assign(p, inferredParams);
                    }
                }
                totalExpected += allParams.length;
                logger.important(
                    `[Build] Route ${route.rawRoute}: ${allParams.length} param combinations`,
                );

                for (const params of allParams) {
                    try {
                        const result = await buildInstance(route, params, pageModule, instanceCtx);
                        if (result.status === 'success') {
                            entry.instances.push(result.instanceEntry);
                            logInstance(route.rawRoute, params);
                        } else {
                            logger.warn(`[Build] Skipped ${route.rawRoute} (${JSON.stringify(params)}): ${result.reason}`);
                            totalExpected--;
                        }
                    } catch (err: any) {
                        instanceCount++;
                        logger.error(
                            `[Build] ${instanceCount}/${totalExpected} FAILED ${route.rawRoute} (${JSON.stringify(params)}): ${err.message}`,
                        );
                    }
                }
            } else {
                logger.info(
                    `[Build] Skipping dynamic route ${route.rawRoute} — no loadParams available`,
                );
            }
        } else {
            try {
                const result = await buildInstance(route, {}, pageModule, instanceCtx);
                if (result.status === 'success') {
                    entry.instances.push(result.instanceEntry);
                    logInstance(route.rawRoute || '/', {});
                } else {
                    logger.warn(`[Build] Skipped ${route.rawRoute || '/'}: ${result.reason}`);
                    totalExpected--;
                }
            } catch (err: any) {
                instanceCount++;
                logger.error(
                    `[Build] ${instanceCount}/${totalExpected} FAILED ${route.rawRoute || '/'}: ${err.message}`,
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
