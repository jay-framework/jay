import type { InstanceEntry, RouteEntry } from '../types';
import type { ArtifactStore } from '../serve/artifact-store';
import { renderInstance } from '../serve/render-instance';
import { synthesizeInstance } from '../shared/instance-key';
import { getLogger } from '@jay-framework/logger';

export interface RebuildInstanceResult {
    status: 'success' | 'skipped';
    instanceEntry?: InstanceEntry;
    reason?: string;
}

/**
 * Re-run the slow phase for one instance and write it through the store (Design Log #227).
 * The instance lives at its deterministic cache path, so a rebuild overwrites it in place
 * (atomically) — there is no manifest entry to update and no orphaned file.
 */
export async function rebuildInstance(
    route: RouteEntry,
    params: Record<string, string>,
    store: ArtifactStore,
): Promise<RebuildInstanceResult> {
    if (!store.writeCacheData) {
        return { status: 'skipped', reason: 'Artifact store is read-only' };
    }

    const outcome = await renderInstance(route, params, store, Date.now());
    if (outcome.kind === 'notFound') {
        return { status: 'skipped', reason: 'ClientError 404' };
    }
    if (outcome.kind === 'redirect') {
        return { status: 'skipped', reason: `Redirect ${outcome.status} ${outcome.location}` };
    }
    if (outcome.kind === 'error') {
        return { status: 'skipped', reason: outcome.reason };
    }

    await store.writeCacheData(route, params, outcome.entry);
    getLogger().info(`[Rebuild] Instance data: ${route.pattern} ${JSON.stringify(params)}`);

    return { status: 'success', instanceEntry: synthesizeInstance(route, params) };
}
