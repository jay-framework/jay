import type { RouteManifest, RouteEntry } from '../types';
import { rebuildInstance } from './rebuild-instance';
import { generateSitemap } from '../builder/generate-sitemap';
import { generateLlmsTxt } from '../builder/generate-llms-txt';
import { matchRoutes } from '../serve/route-matcher';
import { FilesystemArtifactStore } from '../serve/artifact-store';
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
    version: string;
    target: RebuildTarget;
    tsConfigFilePath?: string;
    minify?: boolean;
    /** Site base URL for sitemap regeneration (e.g. "https://example.com"). */
    siteBaseUrl?: string;
    /** Full site identity for llms.txt regeneration (DL#214). `name` drives the llms.txt H1. */
    site?: { name?: string; description?: string; baseUrl?: string };
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

    const store = new FilesystemArtifactStore(backendDir);

    const result: RebuildResult = { affected: 0, rebuilt: 0, errors: [] };

    for (const route of affectedRoutes) {
        // Instances come from the store's index (Design Log #227), re-read from disk (`fresh`).
        const known: Array<Record<string, string>> = [];
        for await (const ref of store.listInstances(route, { fresh: true })) {
            if (!targetParams || paramsMatch(ref.params, targetParams)) known.push(ref.params);
        }
        const toRebuild = known.length === 0 && targetParams ? [targetParams] : known;

        for (const params of toRebuild) {
            result.affected++;

            try {
                const buildResult = await rebuildInstance(route, params, store);
                if (buildResult.status !== 'success') {
                    result.errors.push({
                        route: route.pattern,
                        params,
                        error: buildResult.reason || 'Unknown error',
                    });
                    continue;
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
        // The manifest holds routes only (Design Log #227): rebuilt instances are written in place
        // at their derived path, so there is nothing to update except the generated site files.

        // Regenerate sitemap after successful rebuild
        if (options.siteBaseUrl) {
            const sitemapPath = path.join(frontendDir, 'sitemap.xml');
            const urlCount = await generateSitemap(
                manifest,
                store,
                options.siteBaseUrl,
                sitemapPath,
            );
            logger.info(`[Rebuild] Sitemap regenerated: ${urlCount} URLs`);
        }

        // Regenerate llms.txt after successful rebuild (DL#214) — titles/descriptions may have
        // changed. Requires site.name (the H1); regenerated unconditionally, like the sitemap.
        const site = options.site ?? (options.siteBaseUrl ? { baseUrl: options.siteBaseUrl } : {});
        if (site.name) {
            const llmsPath = path.join(frontendDir, 'llms.txt');
            const count = await generateLlmsTxt(manifest, store, site, llmsPath);
            logger.info(`[Rebuild] llms.txt regenerated: ${count} pages`);
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
            const match = matchRoutes(manifest, target.url).next().value;
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
    version: string;
    contractName: string;
    params?: Record<string, string>;
    tsConfigFilePath?: string;
    minify?: boolean;
    siteBaseUrl?: string;
}): Promise<RebuildResult> {
    return rebuild({
        ...options,
        target: { mode: 'contract', contractName: options.contractName, params: options.params },
    });
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

export async function cleanupOrphanedFiles(buildRoot: string, version: string): Promise<number> {
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
