import type { InstanceEntry, InstanceRef, RouteEntry } from '../types';
import crypto from 'node:crypto';

/**
 * Instance identity (Design Log #227): an instance of a route is identified by its params, and its
 * data lives at a deterministic path derived from `(route pattern, params)`. Build, rebuild,
 * refresh and render-on-miss all derive the path through this one module, so they agree.
 */

/** Stable JSON of params (keys sorted) — the canonical form hashed into the instance id. */
export function canonicalParams(params: Record<string, string>): string {
    const sorted = Object.keys(params)
        .sort()
        .reduce(
            (acc, key) => {
                acc[key] = params[key];
                return acc;
            },
            {} as Record<string, string>,
        );
    return JSON.stringify(sorted);
}

/** Key for maps/sets of instances of one route: `<pattern>:<canonical params>`. */
export function instanceKey(routePattern: string, params: Record<string, string>): string {
    return `${routePattern}:${canonicalParams(params)}`;
}

/**
 * `_<md5(params)[0..8]>`, or `''` for a route without params (so the single instance of a static
 * route is `page.cache.json`).
 */
export function hashParams(params: Record<string, string>): string {
    const json = canonicalParams(params);
    if (json === '{}') return '';
    return '_' + crypto.createHash('md5').update(json).digest('hex').substring(0, 8);
}

/** Directory (under `pre-rendered/` and `pages/`) of a route: `/a/[b]` → `a/[b]`, `/` → `index`. */
export function routeDirOf(routePattern: string): string {
    return routePattern.replace(/^\//, '') || 'index';
}

/** Instance id used in file names: `page` or `page_<hash>`. */
export function instanceIdOf(params: Record<string, string>): string {
    return `page${hashParams(params)}`;
}

/** Directory (relative to the backend dir) holding a route's instance files and page-parts.json. */
export function routeInstanceDir(routePattern: string): string {
    return `pre-rendered/${routeDirOf(routePattern)}`;
}

/** Path (relative to the backend dir) of an instance's cache data. */
export function deriveCachePath(routePattern: string, params: Record<string, string>): string {
    return `${routeInstanceDir(routePattern)}/${instanceIdOf(params)}.cache.json`;
}

/** Path (relative to the backend dir) of a route's page-parts config. */
export function pagePartsConfigPath(routePattern: string): string {
    return `${routeInstanceDir(routePattern)}/page-parts.json`;
}

/**
 * The instance entry for `(route, params)`. Everything except `params`/`cachePath` is route-level
 * (server element, client bundle, CSS), so nothing per-instance is stored beyond the data itself.
 */
export function synthesizeInstance(
    route: Pick<
        RouteEntry,
        'pattern' | 'serverElementPath' | 'routeClientBundlePath' | 'routeCssPath'
    >,
    params: Record<string, string>,
): InstanceEntry {
    return {
        params,
        cachePath: deriveCachePath(route.pattern, params),
        serverElementPath: route.serverElementPath ?? '',
        clientBundlePath: route.routeClientBundlePath ?? '',
        clientCssPath: route.routeCssPath,
    };
}

export function toInstanceRef(
    route: Pick<RouteEntry, 'pattern'>,
    params: Record<string, string>,
): InstanceRef {
    return { params, cachePath: deriveCachePath(route.pattern, params) };
}
