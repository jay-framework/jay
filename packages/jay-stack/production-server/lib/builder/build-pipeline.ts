import type { BuildOptions, BuildMetadata, RouteManifest } from '../types';
import { discoverServerEntries, buildServerCode } from './server-code-build';
import { buildSharedChunks } from './shared-chunks-build';
import { buildInstance, type InstanceBuildContext } from './instance-pipeline';
import { buildRouteEntry, discoverActions, writeRouteManifest } from './route-manifest';
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
    );

    // 0d. Discover actions for manifest
    const actions = await discoverActions(entries.actions, serverOutputDir, buildDir);

    // 0e. Initialize services (needed for slow render)
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
    };

    const routeEntries = routes
        .filter((r) => r.compPath)
        .map((route) => {
            const relativePath = path.relative(options.projectRoot, route.compPath!);
            const serverModule = relativePath
                .replace(/^src\//, 'server/')
                .replace(/\.ts$/, '.js')
                .replace(/\[/g, '_')
                .replace(/\]/g, '_');
            return { route, entry: buildRouteEntry(route, serverModule) };
        });

    let instanceCount = 0;

    for (const { route, entry } of routeEntries) {
        const pageModulePath = path.join(serverOutputDir, entry.serverModule.replace('server/', ''));

        let pageModule: any;
        try {
            pageModule = await import(pageModulePath);
        } catch (err) {
            logger.error(`[Build] Failed to load page module ${pageModulePath}: ${err}`);
            continue;
        }

        const compDefinition = pageModule.page ?? pageModule.default;
        const hasDynamicParams = route.segments.some((s) => typeof s !== 'string');

        if (hasDynamicParams && compDefinition?.loadParams) {
            const parts: DevServerPagePart[] = [
                { compDefinition, clientImport: '', clientPart: '' },
            ];
            const allParams: Record<string, string>[] = [];
            for await (const batch of runLoadParams(parts)) {
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
            const result = await buildInstance(route, {}, pageModule, instanceCtx);
            entry.instances.push(result.instanceEntry);
            instanceCount++;
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
        plugins: [],
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
