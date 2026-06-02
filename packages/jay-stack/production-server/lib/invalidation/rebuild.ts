import type { RouteManifest, RouteEntry, InstanceEntry, BuildMetadata } from '../types';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import { buildInstance, type InstanceBuildContext } from '../builder/instance-pipeline';
import { matchRequest } from '../serve/route-matcher';
import { initializeServices } from '../shared/init-services';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

export type RebuildTarget =
    | { mode: 'contract'; contractName: string; params?: Record<string, string> }
    | { mode: 'route'; routePattern: string; params?: Record<string, string> }
    | { mode: 'url'; url: string };

export interface RebuildOptions {
    projectRoot: string;
    pagesRoot: string;
    buildRoot: string;
    version: number;
    target: RebuildTarget;
    tsConfigFilePath?: string;
    minify?: boolean;
}

export interface RebuildResult {
    affected: number;
    rebuilt: number;
    errors: Array<{ route: string; params?: Record<string, string>; error: string }>;
}

export function resolveContractToRoutes(
    manifest: RouteManifest,
    contractName: string,
): RouteEntry[] {
    return manifest.routes.filter((r) => r.contracts && r.contracts.includes(contractName));
}

export async function rebuild(options: RebuildOptions): Promise<RebuildResult> {
    const logger = getLogger();
    const buildDir = path.join(options.buildRoot, `v${options.version}`);

    const manifestPath = path.join(buildDir, 'backend', 'route-manifest.json');
    const manifest: RouteManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

    const {
        routes: affectedRoutes,
        params: targetParams,
        label,
    } = resolveTarget(manifest, options.target);

    logger.important(`[Rebuild] ${label} in v${options.version}`);

    if (affectedRoutes.length === 0) {
        logger.warn(`[Rebuild] No routes found for ${label}`);
        return { affected: 0, rebuilt: 0, errors: [] };
    }

    logger.important(
        `[Rebuild] Found ${affectedRoutes.length} route(s): ${affectedRoutes.map((r) => r.pattern).join(', ')}`,
    );

    const backendDir = path.join(buildDir, 'backend');
    const frontendDir = path.join(buildDir, 'frontend');

    await initializeServices(backendDir, options.projectRoot, 'Rebuild');

    const rebuildSuffix = Date.now().toString(36);
    const instanceCtx: InstanceBuildContext = {
        projectRoot: options.projectRoot,
        pagesRoot: options.pagesRoot,
        buildDir,
        backendDir,
        frontendDir,
        jayOptions: { tsConfigFilePath: options.tsConfigFilePath },
        tsConfigFilePath: options.tsConfigFilePath,
        minify: options.minify ?? true,
        rebuildSuffix,
    };

    const result: RebuildResult = { affected: 0, rebuilt: 0, errors: [] };
    const orphanedFiles: string[] = [];

    for (const route of affectedRoutes) {
        const instancesToRebuild = targetParams
            ? route.instances.filter((i) => paramsMatch(i.params, targetParams))
            : [...route.instances];

        if (instancesToRebuild.length === 0 && targetParams) {
            instancesToRebuild.push({ params: targetParams } as any);
        }

        for (const instance of instancesToRebuild) {
            result.affected++;
            const params = instance.params;

            // Collect old file paths before rebuild replaces the instance
            const oldFiles = collectInstanceFiles(instance);

            let pageModule: Record<string, unknown>;
            try {
                pageModule = await loadRouteModule(route, buildDir);
            } catch (err: any) {
                result.errors.push({
                    route: route.pattern,
                    params,
                    error: `Failed to load module: ${err.message}`,
                });
                continue;
            }

            const jayRoute = await resolveJayRouteFromManifest(route, options);

            try {
                const buildResult = await buildInstance(jayRoute, params, pageModule, instanceCtx);
                if (buildResult.status !== 'success') {
                    result.errors.push({
                        route: route.pattern,
                        params,
                        error: buildResult.reason,
                    });
                    continue;
                }

                const existingIdx = route.instances.findIndex((i) => paramsMatch(i.params, params));
                if (existingIdx >= 0) {
                    route.instances[existingIdx] = buildResult.instanceEntry;
                    orphanedFiles.push(...oldFiles);
                } else {
                    route.instances.push(buildResult.instanceEntry);
                }

                result.rebuilt++;
                logger.important(`[Rebuild] ${route.pattern} (${JSON.stringify(params)}): rebuilt`);
            } catch (err: any) {
                result.errors.push({
                    route: route.pattern,
                    params,
                    error: err.message,
                });
            }
        }
    }

    if (result.rebuilt > 0) {
        const tempPath = manifestPath + '.tmp';
        await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2));
        await fs.rename(tempPath, manifestPath);

        // Update build-metadata.json — triggers main server manifest reload
        const metadataPath = path.join(buildDir, 'backend', 'build-metadata.json');
        try {
            const metadata: BuildMetadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
            metadata.buildTimestamp = new Date().toISOString();
            metadata.instanceCount = manifest.routes.reduce((n, r) => n + r.instances.length, 0);
            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        } catch {
            // No metadata file — write a new one
            await fs.writeFile(
                metadataPath,
                JSON.stringify(
                    {
                        version: options.version,
                        sourceHash: '',
                        buildTimestamp: new Date().toISOString(),
                        nodeVersion: process.version,
                        instanceCount: manifest.routes.reduce((n, r) => n + r.instances.length, 0),
                    } satisfies BuildMetadata,
                    null,
                    2,
                ),
            );
        }

        logger.important(`[Rebuild] Manifest and metadata updated`);

        // Append orphaned files to cleanup manifest
        if (orphanedFiles.length > 0) {
            await appendCleanupManifest(buildDir, orphanedFiles);
            logger.info(`[Rebuild] ${orphanedFiles.length} orphaned file(s) queued for cleanup`);
        }
    }

    logger.important(
        `[Rebuild] Done: ${result.affected} affected, ${result.rebuilt} rebuilt, ${result.errors.length} errors`,
    );

    return result;
}

function resolveTarget(
    manifest: RouteManifest,
    target: RebuildTarget,
): { routes: RouteEntry[]; params?: Record<string, string>; label: string } {
    switch (target.mode) {
        case 'contract': {
            const routes = resolveContractToRoutes(manifest, target.contractName);
            return {
                routes,
                params: target.params,
                label: `contract "${target.contractName}"${target.params ? ` (${JSON.stringify(target.params)})` : ''}`,
            };
        }
        case 'route': {
            const route = manifest.routes.find((r) => r.pattern === target.routePattern);
            return {
                routes: route ? [route] : [],
                params: target.params,
                label: `route "${target.routePattern}"${target.params ? ` (${JSON.stringify(target.params)})` : ''}`,
            };
        }
        case 'url': {
            const match = matchRequest(manifest, target.url);
            if (!match) {
                return { routes: [], label: `url "${target.url}"` };
            }
            return {
                routes: [match.route],
                params: match.params,
                label: `url "${target.url}" → ${match.route.pattern} (${JSON.stringify(match.params)})`,
            };
        }
    }
}

/** Convenience wrapper for contract-based rebuild (used by renderer server webhooks). */
export async function rebuildContract(options: {
    projectRoot: string;
    pagesRoot: string;
    buildRoot: string;
    version: number;
    contractName: string;
    params?: Record<string, string>;
    tsConfigFilePath?: string;
    minify?: boolean;
}): Promise<RebuildResult> {
    return rebuild({
        ...options,
        target: { mode: 'contract', contractName: options.contractName, params: options.params },
    });
}

async function loadRouteModule(
    route: RouteEntry,
    buildDir: string,
): Promise<Record<string, unknown>> {
    if (!route.serverModule) return {};
    if (route.isPlugin) return import(route.serverModule);
    return import(path.join(buildDir, route.serverModule));
}

async function resolveJayRouteFromManifest(
    route: RouteEntry,
    options: RebuildOptions,
): Promise<JayRoute> {
    const routeDir = route.pattern.replace(/^\//, '') || 'index';
    const jayHtmlPath = path.join(options.pagesRoot, routeDir, 'page.jay-html');

    let resolvedJayHtmlPath = jayHtmlPath;
    if (route.isPlugin && route.serverModule) {
        try {
            const pluginModule = await import(route.serverModule);
            const comp = pluginModule[route.componentExport || 'page'];
            if (comp?.jayHtmlPath) {
                resolvedJayHtmlPath = comp.jayHtmlPath;
            }
        } catch {
            // Fall back to default path
        }
    }

    return {
        rawRoute: route.pattern,
        segments: route.segments.map((s) => {
            if (s.type === 'static') return s.value;
            return { name: s.value, type: segmentTypeMap[s.type] };
        }),
        jayHtmlPath: resolvedJayHtmlPath,
        compPath: route.isPlugin ? route.serverModule : undefined,
        componentExport: route.componentExport,
    } as JayRoute;
}

const segmentTypeMap: Record<string, number> = {
    param: 0,
    catchAll: 1,
    optional: 2,
};

function paramsMatch(
    instanceParams: Record<string, string>,
    targetParams: Record<string, string>,
): boolean {
    return Object.entries(targetParams).every(([key, value]) => instanceParams[key] === value);
}

function collectInstanceFiles(instance: InstanceEntry): string[] {
    if (!instance.cachePath) return [];
    const files = [instance.cachePath, instance.serverElementPath, instance.clientBundlePath];
    if (instance.clientCssPath) files.push(instance.clientCssPath);
    return files.filter(Boolean);
}

async function appendCleanupManifest(buildDir: string, files: string[]): Promise<void> {
    const cleanupPath = path.join(buildDir, 'cleanup-manifest.json');
    let existing: string[] = [];
    try {
        existing = JSON.parse(await fs.readFile(cleanupPath, 'utf-8'));
    } catch {
        // No existing cleanup manifest
    }
    existing.push(...files);
    await fs.writeFile(cleanupPath, JSON.stringify(existing, null, 2));
}

export async function cleanupOrphanedFiles(buildRoot: string, version: number): Promise<number> {
    const logger = getLogger();
    const buildDir = path.join(buildRoot, `v${version}`);
    const cleanupPath = path.join(buildDir, 'cleanup-manifest.json');

    let files: string[];
    try {
        files = JSON.parse(await fs.readFile(cleanupPath, 'utf-8'));
    } catch {
        logger.info('[Cleanup] No cleanup manifest found');
        return 0;
    }

    let deleted = 0;
    for (const file of files) {
        try {
            await fs.unlink(path.join(buildDir, file));
            deleted++;
        } catch {
            // File already gone or never existed
        }
    }

    await fs.unlink(cleanupPath);
    logger.important(`[Cleanup] Deleted ${deleted}/${files.length} orphaned files`);
    return deleted;
}
