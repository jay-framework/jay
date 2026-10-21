import type { RouteManifest, RouteEntry, InstanceEntry, RouteSegment } from '../types';

/** A route whose segments match a request path (before the instance is resolved). */
export interface RouteMatch {
    route: RouteEntry;
    params: Record<string, string>;
    pathname: string;
}

/** A matched route with its resolved instance. */
export interface MatchResult {
    route: RouteEntry;
    instance: InstanceEntry;
    params: Record<string, string>;
    pathname: string;
}

/**
 * Every route whose segments match `pathname`, in manifest (specificity) order, with the extracted
 * params. The instance is resolved separately through the store (`getInstance`), so a route can
 * match without an instance existing — that is the render-on-miss case (Design Log #227).
 */
export function* matchRoutes(manifest: RouteManifest, pathname: string): Generator<RouteMatch> {
    const urlSegments = pathname.split('/').filter((s) => s.length > 0);

    for (const route of manifest.routes) {
        const params = matchSegments(route.segments, urlSegments);
        if (params) {
            yield { route, params, pathname };
        }
    }
}

function matchSegments(
    routeSegments: RouteSegment[],
    urlSegments: string[],
): Record<string, string> | undefined {
    const params: Record<string, string> = {};
    let urlIdx = 0;

    for (let i = 0; i < routeSegments.length; i++) {
        const seg = routeSegments[i];

        if (seg.type === 'static') {
            if (urlIdx >= urlSegments.length || urlSegments[urlIdx] !== seg.value) {
                return undefined;
            }
            urlIdx++;
        } else if (seg.type === 'param') {
            if (urlIdx >= urlSegments.length) return undefined;
            params[seg.value] = urlSegments[urlIdx];
            urlIdx++;
        } else if (seg.type === 'optional') {
            if (urlIdx < urlSegments.length) {
                params[seg.value] = urlSegments[urlIdx];
                urlIdx++;
            }
        } else if (seg.type === 'catchAll') {
            if (urlIdx >= urlSegments.length) return undefined;
            params[seg.value] = urlSegments.slice(urlIdx).join('/');
            urlIdx = urlSegments.length;
        } else if (seg.type === 'optionalCatchAll') {
            if (urlIdx < urlSegments.length) {
                params[seg.value] = urlSegments.slice(urlIdx).join('/');
                urlIdx = urlSegments.length;
            }
        }
    }

    if (urlIdx !== urlSegments.length) return undefined;

    return params;
}
