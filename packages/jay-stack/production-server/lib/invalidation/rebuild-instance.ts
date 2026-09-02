import type { InstanceEntry, RouteEntry } from '../types';
import { loadPagePartsFromConfig } from '../builder/load-production-parts';
import { FilesystemArtifactStore } from '../serve/artifact-store';
import { DevSlowlyChangingPhase, slowRenderInstances } from '@jay-framework/stack-server-runtime';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export interface RebuildInstanceResult {
    status: 'success' | 'skipped';
    instanceEntry?: InstanceEntry;
    reason?: string;
}

function hashParams(params: Record<string, string>, suffix?: string): string {
    const sorted = Object.keys(params)
        .sort()
        .reduce(
            (acc, key) => {
                acc[key] = params[key];
                return acc;
            },
            {} as Record<string, string>,
        );
    const json = JSON.stringify(sorted);
    if (json === '{}' && !suffix) return '';
    const input = suffix ? json + ':' + suffix : json;
    return '_' + crypto.createHash('md5').update(input).digest('hex').substring(0, 8);
}

export async function rebuildInstance(
    route: RouteEntry,
    params: Record<string, string>,
    backendDir: string,
    rebuildSuffix?: string,
): Promise<RebuildInstanceResult> {
    const logger = getLogger();
    const routeDir = route.pattern.replace(/^\//, '') || 'index';
    const paramHash = hashParams(params, rebuildSuffix);
    const instanceId = `page${paramHash}`;
    const backendInstanceDir = path.join(backendDir, 'pre-rendered', routeDir);

    await fs.mkdir(backendInstanceDir, { recursive: true });

    const pagePartsConfigPath = path.join(backendInstanceDir, 'page-parts.json');
    const artifacts = new FilesystemArtifactStore(backendDir);

    let pageParts;
    try {
        pageParts = await loadPagePartsFromConfig(
            path.relative(backendDir, pagePartsConfigPath),
            artifacts,
        );
    } catch (err: any) {
        return { status: 'skipped', reason: `Failed to load page-parts.json: ${err.message}` };
    }

    const slowPhase = new DevSlowlyChangingPhase();
    const slowResult = await slowPhase.runSlowlyForPage(
        params,
        { params },
        pageParts.parts,
        pageParts.discoveredInstances,
        pageParts.headlessInstanceComponents,
    );

    if (slowResult.kind !== 'PhaseOutput') {
        if (slowResult.kind === 'ClientError' || slowResult.kind === 'Redirect') {
            return {
                status: 'skipped',
                reason: `${slowResult.kind} ${(slowResult as any).status ?? ''} ${(slowResult as any).message ?? ''}`.trim(),
            };
        }
        return { status: 'skipped', reason: `Slow render returned: ${slowResult.kind}` };
    }

    const slowViewState = slowResult.rendered;
    const carryForward = slowResult.carryForward;

    if (
        pageParts.discoveredInstances &&
        pageParts.discoveredInstances.length > 0 &&
        pageParts.headlessInstanceComponents.length > 0
    ) {
        const instanceSlowResult = await slowRenderInstances(
            pageParts.discoveredInstances,
            pageParts.headlessInstanceComponents,
            {
                pageViewState: slowViewState,
                pageParams: params,
                pageProps: { language: 'en', url: '' },
            },
        );

        if (instanceSlowResult) {
            const existingInstances = (carryForward as any).__instances || {
                discovered: [],
                carryForwards: {},
            };
            (carryForward as any).__instances = {
                discovered: [
                    ...existingInstances.discovered,
                    ...instanceSlowResult.instancePhaseData.discovered,
                ],
                carryForwards: {
                    ...existingInstances.carryForwards,
                    ...instanceSlowResult.instancePhaseData.carryForwards,
                },
                slowViewStates: {
                    ...(existingInstances.slowViewStates || {}),
                    ...(instanceSlowResult.instancePhaseData as any).slowViewStates,
                },
            };
        }
    }

    if (pageParts.forEachInstances && pageParts.forEachInstances.length > 0) {
        const existingInstances = (carryForward as any).__instances || {
            discovered: [],
            carryForwards: {},
        };
        existingInstances.forEachInstances = pageParts.forEachInstances;
        (carryForward as any).__instances = existingInstances;
    }

    const cachePath = path.join(backendInstanceDir, `${instanceId}.cache.json`);
    await fs.writeFile(cachePath, JSON.stringify({ slowViewState, carryForward }), 'utf-8');

    logger.info(`[Rebuild] Instance data: ${routeDir}/${instanceId}`);

    const instanceEntry: InstanceEntry = {
        params,
        cachePath: path.relative(backendDir, cachePath),
        serverElementPath: route.serverElementPath || '',
        clientBundlePath: route.routeClientBundlePath || '',
        clientCssPath: route.routeCssPath,
    };

    return { status: 'success', instanceEntry };
}
