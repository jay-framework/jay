import type { RouteManifest } from '../types';
import type { ArtifactStore } from './artifact-store';
import type { InstanceRenderer } from './instance-renderer';
import { matchRoutes, type MatchResult } from './route-matcher';

export type ResolveResult =
    | { kind: 'matched'; match: MatchResult }
    /** No route/instance matches (and none could be rendered): respond with the 404 page. */
    | { kind: 'notFound' }
    /** The slow render of an unknown instance redirected: respond with this redirect. */
    | { kind: 'redirect'; status: number; location: string }
    /**
     * An unknown instance could not be rendered right now (no free slow-render slot, timeout, error):
     * respond `503` with `Retry-After`. Never cached — we cannot tell whether the item exists.
     */
    | { kind: 'unavailable'; retryAfterSeconds: number };

/**
 * Resolve a request path to a route + instance (Design Log #227).
 *
 * For each route whose segments match (in specificity order) the store resolves the instance. A
 * matching route without an instance is rendered on demand through the {@link InstanceRenderer}
 * (single-flight, shared slow-render slots, negative cache). A real 404 falls through to the next
 * matching route, exactly like "no instance" did before; no renderer means build-time-only
 * instances (the previous behavior).
 */
export async function resolveRequest(
    manifest: RouteManifest,
    pathname: string,
    store: ArtifactStore,
    renderer?: InstanceRenderer,
): Promise<ResolveResult> {
    for (const { route, params } of matchRoutes(manifest, pathname)) {
        const existing = await store.getInstance(route, params);
        if (existing) {
            return { kind: 'matched', match: { route, instance: existing, params, pathname } };
        }
        if (!renderer) continue;

        const outcome = await renderer.renderMissing(route, params);
        if (outcome.kind === 'rendered') {
            return {
                kind: 'matched',
                match: { route, instance: outcome.instance, params, pathname },
            };
        }
        if (outcome.kind === 'redirect') {
            return { kind: 'redirect', status: outcome.status, location: outcome.location };
        }
        if (outcome.kind === 'unavailable') {
            return { kind: 'unavailable', retryAfterSeconds: outcome.retryAfterSeconds };
        }
        // notFound → fall through to the next matching route
    }
    return { kind: 'notFound' };
}
