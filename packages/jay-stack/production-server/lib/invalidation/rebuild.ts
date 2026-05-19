import type { RouteManifest, RouteEntry, InstanceEntry } from '../types';
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
    skipped: number;
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

    const manifestPath = path.join(buildDir, 'route-manifest.json');
    const manifest: RouteManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

    const { routes: affectedRoutes, params: targetParams, label } = resolveTarget(
        manifest,
        options.target,
    );

    logger.important(`[Rebuild] ${label} in v${options.version}`);

    if (affectedRoutes.length === 0) {
        logger.warn(`[Rebuild] No routes found for ${label}`);
        return { affected: 0, rebuilt: 0, skipped: 0, errors: [] };
    }

    logger.important(
        `[Rebuild] Found ${affectedRoutes.length} route(s): ${affectedRoutes.map((r) => r.pattern).join(', ')}`,
    );

    await initializeServices(buildDir, options.projectRoot, 'Rebuild');

    const instanceCtx: InstanceBuildContext = {
        projectRoot: options.projectRoot,
        pagesRoot: options.pagesRoot,
        buildDir,
        jayOptions: { tsConfigFilePath: options.tsConfigFilePath },
        tsConfigFilePath: options.tsConfigFilePath,
        minify: options.minify ?? true,
    };

    const result: RebuildResult = { affected: 0, rebuilt: 0, skipped: 0, errors: [] };

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

            let existingContent: string | undefined;
            if (instance.preRenderedPath) {
                try {
                    existingContent = await fs.readFile(
                        path.join(buildDir, instance.preRenderedPath),
                        'utf-8',
                    );
                } catch {
                    // No existing file
                }
            }

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

                if (existingContent) {
                    try {
                        const newContent = await fs.readFile(
                            path.join(buildDir, buildResult.instanceEntry.preRenderedPath),
                            'utf-8',
                        );
                        if (
                            stripCacheMetadata(newContent) === stripCacheMetadata(existingContent)
                        ) {
                            logger.important(
                                `[Rebuild] ${route.pattern} (${JSON.stringify(params)}): unchanged, skipped`,
                            );
                            result.skipped++;
                            continue;
                        }
                    } catch {
                        // Can't compare, treat as changed
                    }
                }

                const existingIdx = route.instances.findIndex((i) => paramsMatch(i.params, params));
                if (existingIdx >= 0) {
                    route.instances[existingIdx] = buildResult.instanceEntry;
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
        logger.important(`[Rebuild] Manifest updated`);
    }

    logger.important(
        `[Rebuild] Done: ${result.affected} affected, ${result.rebuilt} rebuilt, ${result.skipped} unchanged, ${result.errors.length} errors`,
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

function stripCacheMetadata(content: string): string {
    return content.replace(/<script type="application\/jay-cache">[\s\S]*?<\/script>\n?/, '');
}
