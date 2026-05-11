import type { RouteManifest, RouteEntry, InstanceEntry, RouteSegment } from '../types';

export interface MatchResult {
    route: RouteEntry;
    instance: InstanceEntry;
    params: Record<string, string>;
    pathname: string;
}

export function matchRequest(
    manifest: RouteManifest,
    pathname: string,
): MatchResult | undefined {
    const urlSegments = pathname.split('/').filter((s) => s.length > 0);

    for (const route of manifest.routes) {
        const params = matchSegments(route.segments, urlSegments);
        if (params) {
            const instance = findInstance(route, params);
            if (instance) {
                return { route, instance, params, pathname };
            }
        }
    }

    return undefined;
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

function findInstance(
    route: RouteEntry,
    params: Record<string, string>,
): InstanceEntry | undefined {
    return route.instances.find((instance) => {
        const iKeys = Object.keys(instance.params);
        const pKeys = Object.keys(params);
        if (iKeys.length !== pKeys.length) return false;
        return iKeys.every((k) => instance.params[k] === params[k]);
    });
}
