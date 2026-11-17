/**
 * Slow-phase freshness (Design Log #226).
 *
 * A slow render may return `ttl` and `grace` (both **seconds**) next to its ViewState. A page can
 * have several slow components (the page component, keyed headless components, headless
 * instances); the instance's effective freshness is derived by `combineFreshness`.
 */

/** Default `grace` (seconds) when no slow part returns one: 12 hours — or `ttl` when that is larger. */
export const DEFAULT_GRACE_SECONDS = 12 * 60 * 60;

/** Floor (seconds) applied to the combined `ttl` to protect external APIs. */
export const MIN_TTL_SECONDS = 10;

/** Freshness requested by one slow part. Non-positive / missing values mean "no opinion". */
export interface FreshnessInput {
    ttl?: number | null;
    grace?: number | null;
}

/** Effective freshness of an instance (seconds). No `ttl` → never stale. */
export interface FreshnessPolicy {
    ttl?: number;
    grace?: number;
}

function positive(value: number | null | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Merge the freshness requested by several slow parts: the minimum **positive** `ttl` and the
 * minimum **positive** `grace`, computed independently. `0` / `null` / `undefined` are ignored.
 * No defaults and no floor are applied, so merged results can be merged again
 * (e.g. page result + headless-instance result) without baking defaults in.
 */
export function mergeFreshness(parts: ReadonlyArray<FreshnessInput | undefined>): FreshnessInput {
    let ttl: number | undefined;
    let grace: number | undefined;
    for (const part of parts) {
        if (!part) continue;
        const partTtl = positive(part.ttl);
        const partGrace = positive(part.grace);
        if (partTtl !== undefined) ttl = ttl === undefined ? partTtl : Math.min(ttl, partTtl);
        if (partGrace !== undefined)
            grace = grace === undefined ? partGrace : Math.min(grace, partGrace);
    }
    return {
        ...(ttl !== undefined && { ttl }),
        ...(grace !== undefined && { grace }),
    };
}

/**
 * Turn merged freshness into the effective policy stored with an instance.
 *
 * - No positive `ttl` → `{}` (the instance is never stale).
 * - `ttl` is raised to {@link MIN_TTL_SECONDS}.
 * - No `grace` → `max(12h, ttl)`; a `grace` smaller than `ttl` is raised to `ttl`.
 */
export function resolveFreshness(merged: FreshnessInput): FreshnessPolicy {
    const ttl = positive(merged.ttl);
    if (ttl === undefined) return {};
    const effectiveTtl = Math.max(ttl, MIN_TTL_SECONDS);
    const effectiveGrace = Math.max(positive(merged.grace) ?? DEFAULT_GRACE_SECONDS, effectiveTtl);
    return { ttl: effectiveTtl, grace: effectiveGrace };
}

/** `resolveFreshness(mergeFreshness(parts))` — the effective freshness of a page's slow parts. */
export function combineFreshness(
    parts: ReadonlyArray<FreshnessInput | undefined>,
): FreshnessPolicy {
    return resolveFreshness(mergeFreshness(parts));
}
