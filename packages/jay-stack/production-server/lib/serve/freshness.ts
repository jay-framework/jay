import type { CacheEntry } from '../types';
import { DEFAULT_GRACE_SECONDS } from '@jay-framework/stack-server-runtime';

/**
 * Serve-time freshness of a slow-render cache entry (Design Log #226).
 *
 * - `fresh`   — age < ttl. Served as is; cache headers are clamped to the remaining TTL.
 * - `stale`   — ttl ≤ age < grace. Served immediately from the stored data, refreshed in the background.
 * - `expired` — age ≥ grace. The refresh is awaited (bounded); if it does not finish in time the
 *               stored data is served.
 */
export type FreshnessState = 'fresh' | 'stale' | 'expired';

export type FreshnessFields = Pick<CacheEntry, 'renderedAt' | 'ttl' | 'grace'>;

/** Response header describing the freshness of the served data: `jay-freshness: stale, 20000ms`. */
export const FRESHNESS_HEADER = 'jay-freshness';

/** True when the entry carries a freshness contract (a `ttl` and a render time). */
export function hasFreshnessContract(entry: FreshnessFields): boolean {
    return entry.ttl !== undefined && entry.renderedAt !== undefined;
}

/** Age of the entry in milliseconds (0 when it has no `renderedAt`). */
export function ageMs(entry: FreshnessFields, now: number): number {
    return entry.renderedAt === undefined ? 0 : Math.max(0, now - entry.renderedAt);
}

/**
 * Classify an entry. Entries without a `ttl` (or render time) never go stale. `ttl`/`grace` are
 * seconds, `renderedAt` is epoch ms. A `grace` smaller than `ttl` is raised to `ttl`.
 */
export function classify(entry: FreshnessFields, now: number): FreshnessState {
    if (!hasFreshnessContract(entry)) return 'fresh';
    const ttl = entry.ttl as number;
    const ageSec = ageMs(entry, now) / 1000;
    if (ageSec < ttl) return 'fresh';
    const grace = Math.max(entry.grace ?? DEFAULT_GRACE_SECONDS, ttl);
    return ageSec < grace ? 'stale' : 'expired';
}

export type ResponseHeaders = Record<string, string>;

function findKey(headers: ResponseHeaders, name: string): string | undefined {
    const lower = name.toLowerCase();
    return Object.keys(headers).find((key) => key.toLowerCase() === lower);
}

function remove(headers: ResponseHeaders, name: string): void {
    const key = findKey(headers, name);
    if (key !== undefined) delete headers[key];
}

function set(headers: ResponseHeaders, name: string, value: string): void {
    remove(headers, name);
    headers[name] = value;
}

/** Clamp `max-age` / `s-maxage` to `remainingSeconds`; drop directives that extend life past the TTL. */
function clampCacheControl(value: string, remainingSeconds: number): string {
    const directives = value
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
    const kept: string[] = [];
    for (const directive of directives) {
        const [rawName, rawArg] = directive.split('=');
        const name = rawName.trim().toLowerCase();
        if (name === 'stale-while-revalidate' || name === 'stale-if-error') continue;
        if ((name === 'max-age' || name === 's-maxage') && rawArg !== undefined) {
            const current = Number(rawArg.trim().replace(/^"|"$/g, ''));
            const clamped = Number.isFinite(current)
                ? Math.min(current, remainingSeconds)
                : remainingSeconds;
            kept.push(`${name}=${clamped}`);
            continue;
        }
        kept.push(directive);
    }
    return kept.join(', ');
}

/** Make a validator change whenever the served slow data changes: `"abc"` → `"abc-<renderedAt>"`. */
function withRenderedAt(etag: string, renderedAt: number): string {
    const match = /^(W\/)?"(.*)"$/.exec(etag.trim());
    if (!match) return etag;
    return `${match[1] ?? ''}"${match[2]}-${renderedAt}"`;
}

export interface ApplyFreshnessOptions {
    /** Emit the `jay-freshness` header (default true). */
    freshnessHeader?: boolean;
}

/**
 * Adjust the response headers of a page built from `entry`.
 *
 * `state` is the state of the data **actually used** to build the response: `fresh`, or
 * `stale` / `expired` when old data is served (an `expired` entry whose awaited refresh finished
 * in time is rendered from the new entry and therefore reported as `fresh`).
 *
 * - No freshness contract → headers returned unchanged.
 * - Old data (`stale` / `expired`) → `Cache-Control: no-store` (replaces any cacheable header from
 *   fast render), `Expires` dropped. Validators are kept.
 * - `fresh` → `max-age` / `s-maxage` clamped to the remaining TTL; `stale-while-revalidate` /
 *   `stale-if-error` removed; stricter directives (`private`, `no-store`, `no-cache`) kept. When
 *   fast render set no `Cache-Control` none is invented.
 * - An `ETag` provided by fast render gets the entry's `renderedAt` folded in, so a refresh
 *   invalidates old validators.
 * - Adds `jay-freshness: <state>, <age>ms`.
 */
export function applyFreshness(
    headers: ResponseHeaders,
    entry: FreshnessFields,
    state: FreshnessState,
    now: number,
    options: ApplyFreshnessOptions = {},
): ResponseHeaders {
    if (!hasFreshnessContract(entry)) return headers;

    const result: ResponseHeaders = { ...headers };
    const age = ageMs(entry, now);

    if (state === 'stale' || state === 'expired') {
        set(result, 'Cache-Control', 'no-store');
        remove(result, 'Expires');
    } else {
        const cacheControlKey = findKey(result, 'Cache-Control');
        if (cacheControlKey !== undefined) {
            const remainingSeconds = Math.max(0, Math.floor((entry.ttl as number) - age / 1000));
            result[cacheControlKey] = clampCacheControl(result[cacheControlKey], remainingSeconds);
        }
    }

    const etagKey = findKey(result, 'ETag');
    if (etagKey !== undefined) {
        result[etagKey] = withRenderedAt(result[etagKey], entry.renderedAt as number);
    }

    if (options.freshnessHeader !== false) {
        set(result, FRESHNESS_HEADER, `${state}, ${Math.round(age)}ms`);
    }
    return result;
}
