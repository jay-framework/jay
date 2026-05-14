import { getLogger } from '@jay-framework/logger';

export interface RouteInfo {
    rawRoute: string;
    inferredParams?: Record<string, string>;
    hasDynamicParams: boolean;
}

export interface ParamPart {
    keys: Set<string>;
    values: Record<string, string>[];
}

export interface MaterializedEntry<R extends RouteInfo = RouteInfo> {
    route: R;
    params: Record<string, string>;
    url: string;
    specificity: number;
}

export function crossProductParams(parts: ParamPart[]): Record<string, string>[] {
    if (parts.length === 0) return [];
    if (parts.length === 1) return parts[0].values;

    const logger = getLogger();

    for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
            for (const key of parts[i].keys) {
                if (parts[j].keys.has(key)) {
                    logger.warn(
                        `[Build] Multiple loadParams provide key "${key}" — using first provider`,
                    );
                }
            }
        }
    }

    let result = parts[0].values;
    for (let i = 1; i < parts.length; i++) {
        const next = parts[i].values;
        const combined: Record<string, string>[] = [];
        for (const a of result) {
            for (const b of next) {
                combined.push({ ...a, ...b });
            }
        }
        result = combined;
    }
    return result;
}

function paramsMatchInferred(
    params: Record<string, string>,
    inferredParams: Record<string, string>,
): boolean {
    return Object.entries(inferredParams).every(([k, v]) => params[k] === v);
}

export function computeSpecificity(route: RouteInfo): number {
    const dynamicCount = (route.rawRoute.match(/\[/g) || []).length;
    const inferredCount = route.inferredParams ? Object.keys(route.inferredParams).length : 0;
    const unresolvedCount = Math.max(0, dynamicCount - inferredCount);
    return 0 - unresolvedCount;
}

function buildUrl(route: RouteInfo, params: Record<string, string>): string {
    return route.rawRoute.replace(/\[\[?(\w+)\]?\]/g, (_, name) => params[name] || '');
}

export function materializeRouteParams<R extends RouteInfo>(
    routes: R[],
    loadParamsResults: Map<R, Record<string, string>[]>,
): MaterializedEntry<R>[] {
    const entries: MaterializedEntry<R>[] = [];

    for (const route of routes) {
        const specificity = computeSpecificity(route);

        if (!route.hasDynamicParams) {
            const params = route.inferredParams || {};
            entries.push({ route, params, url: route.rawRoute, specificity });
            continue;
        }

        const allParams = loadParamsResults.get(route) || [];
        for (const params of allParams) {
            if (route.inferredParams && !paramsMatchInferred(params, route.inferredParams)) {
                continue;
            }
            const mergedParams = route.inferredParams ? { ...params, ...route.inferredParams } : params;
            const url = buildUrl(route, mergedParams);
            entries.push({ route, params: mergedParams, url, specificity });
        }
    }

    return entries;
}

export function dedupeByUrl<R extends RouteInfo>(
    entries: MaterializedEntry<R>[],
): MaterializedEntry<R>[] {
    const logger = getLogger();
    const byUrl = new Map<string, MaterializedEntry<R>>();

    for (const entry of entries) {
        const existing = byUrl.get(entry.url);
        if (!existing) {
            byUrl.set(entry.url, entry);
        } else if (entry.specificity > existing.specificity) {
            byUrl.set(entry.url, entry);
        }
    }

    const deduped = [...byUrl.values()];
    if (deduped.length < entries.length) {
        logger.info(
            `[Build] Deduplication: ${entries.length} materialized → ${deduped.length} unique URLs`,
        );
    }
    return deduped;
}
