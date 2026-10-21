import type { CacheEntry, RouteEntry } from '../types';
import type { ArtifactStore } from './artifact-store';
import { getPageParts } from './page-parts';
import { buildUrlFromManifest } from '../builder/generate-sitemap';
import {
    DevSlowlyChangingPhase,
    slowRenderInstances,
    mergeFreshness,
    resolveFreshness,
} from '@jay-framework/stack-server-runtime';

/**
 * Outcome of running the slow phase for one instance (Design Log #226/#227).
 *
 * - `rendered` — a fresh cache entry (with `renderedAt` / `ttl` / `grace`). Nothing is persisted here.
 * - `notFound` — slow render answered a deterministic client error (404, 410, 400, 422, …): the item
 *   cannot be rendered for these params, exactly like the build, which skips them.
 * - `redirect` — slow render returned a redirect (e.g. a renamed slug): served as that redirect.
 * - `error` — anything else (5xx, 401/403/408/429, thrown): transient, never negative-cached.
 */
export type RenderInstanceOutcome =
    | { kind: 'rendered'; entry: CacheEntry }
    | { kind: 'notFound' }
    | { kind: 'redirect'; status: number; location: string }
    | { kind: 'error'; reason: string };

/**
 * 4xx statuses that mean "not now" (credentials, timeout, rate limit) rather than "this item does
 * not exist". They are transient: 503 + backoff, never negative-cached.
 */
const TRANSIENT_CLIENT_ERRORS = new Set([401, 403, 408, 429]);

export type RenderInstanceFn = (
    route: RouteEntry,
    params: Record<string, string>,
    artifacts: ArtifactStore,
    now: number,
) => Promise<RenderInstanceOutcome>;

/**
 * Run the slow phase (page + keyed headless components + headless instances) for
 * `(route, params)` and return the resulting cache entry. Pure with respect to storage: the caller
 * decides where the entry goes (`ArtifactStore.writeCacheData`).
 */
export const renderInstance: RenderInstanceFn = async (route, params, artifacts, now) => {
    let pageParts;
    try {
        pageParts = await getPageParts(route, artifacts);
    } catch (err: any) {
        return { kind: 'error', reason: `Failed to load page parts: ${err?.message ?? err}` };
    }

    // Concrete URL for this instance, so slow-phase bindings like {jay.url.path}
    // resolve to the real path instead of '' (DL#163).
    const pageUrl = buildUrlFromManifest(route.pattern, params);

    const slowPhase = new DevSlowlyChangingPhase();
    let slowResult;
    try {
        slowResult = await slowPhase.runSlowlyForPage(
            params,
            { language: 'en', url: pageUrl },
            pageParts.parts,
            pageParts.discoveredInstances,
            pageParts.headlessInstanceComponents,
        );
    } catch (err: any) {
        return { kind: 'error', reason: `Slow render threw: ${err?.message ?? err}` };
    }

    if (slowResult.kind !== 'PhaseOutput') {
        if (slowResult.kind === 'ClientError' && !TRANSIENT_CLIENT_ERRORS.has(slowResult.status)) {
            return { kind: 'notFound' };
        }
        if (slowResult.kind === 'Redirect') {
            return {
                kind: 'redirect',
                status: slowResult.status,
                location: slowResult.location,
            };
        }
        const detail = `${(slowResult as any).status ?? ''} ${(slowResult as any).message ?? ''}`;
        return {
            kind: 'error',
            reason: `Slow render returned ${slowResult.kind} ${detail}`.trim(),
        };
    }

    const slowViewState = slowResult.rendered;
    const carryForward = slowResult.carryForward;
    let instanceFreshness = {};

    try {
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
                    pageProps: { language: 'en', url: pageUrl },
                },
            );

            if (instanceSlowResult) {
                instanceFreshness = instanceSlowResult.freshness;
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
    } catch (err: any) {
        return { kind: 'error', reason: `Instance slow render threw: ${err?.message ?? err}` };
    }

    if (pageParts.forEachInstances && pageParts.forEachInstances.length > 0) {
        const existingInstances = (carryForward as any).__instances || {
            discovered: [],
            carryForwards: {},
        };
        existingInstances.forEachInstances = pageParts.forEachInstances;
        (carryForward as any).__instances = existingInstances;
    }

    // min positive ttl / grace across the page's slow parts and its headless instances (#226)
    const freshness = resolveFreshness(
        mergeFreshness([{ ttl: slowResult.ttl, grace: slowResult.grace }, instanceFreshness]),
    );

    return {
        kind: 'rendered',
        entry: {
            slowViewState,
            carryForward,
            renderedAt: now,
            ...(freshness.ttl !== undefined && { ttl: freshness.ttl }),
            ...(freshness.grace !== undefined && { grace: freshness.grace }),
        },
    };
};
