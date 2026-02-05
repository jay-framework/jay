import { promises as fs } from 'fs';
import path from 'path';
import { getLogger } from '@jay-framework/logger';

export enum JayRouteParamType {
    single,
    catchAll,
    optional,
}
export interface JayRouteParam {
    name: string;
    type: JayRouteParamType;
}
export type JayRouteSegment = string | JayRouteParam;
export type JayRoute = {
    segments: JayRouteSegment[];
    rawRoute: string;
    jayHtmlPath: string;
    compPath: string;
    /**
     * For static override routes, inferred params from sibling dynamic routes.
     * e.g., /products/ceramic-flower-vase has inferredParams: { slug: 'ceramic-flower-vase' }
     * when /products/[slug] exists as a sibling.
     */
    inferredParams?: Record<string, string>;
};
export type JayRoutes = JayRoute[];

// Regex pattern:
// ^\[        - Starts with [
// (\[)?      - Optional second [ (for optional params)
// (\.\.\.)?  - Optional ... (for catch-all)
// ([^\]]+)   - Capture the name (one or more characters that aren't ])
// \]?        - Optional closing ] (matches the optional opening [)
// \]$        - Ends with ]
const PARSE_PARAM = /^\[(\[)?(\.\.\.)?([^\]]+)\]?\]$/;

export interface ScanFilesOptions {
    jayHtmlFilename: string;
    compFilename: string;
}

function convertToRoutePath(
    BASE_DIR: string,
    jayHtmlPath: string,
    { jayHtmlFilename, compFilename }: ScanFilesOptions,
): JayRoute {
    let rawRoute = jayHtmlPath
        .replace(BASE_DIR, '')
        .replace(`/${jayHtmlFilename}`, '')
        .replace('\\', '/'); // Normalize Windows paths

    // Handle parameters in folder names
    const segments: JayRouteSegment[] = rawRoute
        .split('/')
        .filter((segment) => segment.length > 0)
        .map((segment) => {
            const match = segment.match(PARSE_PARAM);
            if (!match) return segment;
            const isParam = true;
            const isOptional = !!match[1]; // True if there's an opening [[
            const isCatchAll = !!match[2]; // True if there's ...
            const name = match[3];
            if (isParam)
                return {
                    name,
                    type: isOptional
                        ? JayRouteParamType.optional
                        : isCatchAll
                          ? JayRouteParamType.catchAll
                          : JayRouteParamType.single,
                };
            else return name;
        });

    const compPath = jayHtmlPath.replace(jayHtmlFilename, compFilename);
    return { segments, jayHtmlPath, compPath, rawRoute };
}

async function scanDirectory(
    BASE_DIR: string,
    directory: string,
    options: ScanFilesOptions,
): Promise<JayRoutes> {
    let routes: JayRoutes = [];
    const items = await fs.readdir(directory, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(directory, item.name);

        if (item.isDirectory()) {
            routes = [...routes, ...(await scanDirectory(BASE_DIR, fullPath, options))];
        } else if (item.name === options.jayHtmlFilename) {
            const route = convertToRoutePath(BASE_DIR, fullPath, options);
            routes.push(route);
        }
    }
    return routes;
}

/**
 * Get the priority of a segment for sorting purposes.
 * Lower number = higher priority (matches first).
 *
 * Priority order:
 * 0 - Static segments (e.g., "products")
 * 1 - Single params (e.g., [slug])
 * 2 - Optional params (e.g., [[slug]])
 * 3 - Catch-all params (e.g., [...path])
 */
function getSegmentPriority(segment: JayRouteSegment): number {
    if (typeof segment === 'string') return 0;
    switch (segment.type) {
        case JayRouteParamType.single:
            return 1;
        case JayRouteParamType.optional:
            return 2;
        case JayRouteParamType.catchAll:
            return 3;
    }
}

/**
 * Compare two routes for sorting by specificity.
 * More specific routes (static) come before less specific (dynamic).
 */
function compareRoutes(a: JayRoute, b: JayRoute): number {
    const maxLen = Math.max(a.segments.length, b.segments.length);

    for (let i = 0; i < maxLen; i++) {
        const segA = a.segments[i];
        const segB = b.segments[i];

        // If one route is shorter, it's less specific (comes later)
        if (segA === undefined) return 1;
        if (segB === undefined) return -1;

        const priorityA = getSegmentPriority(segA);
        const priorityB = getSegmentPriority(segB);

        if (priorityA !== priorityB) return priorityA - priorityB;

        // Both same type - if static, compare alphabetically for determinism
        if (typeof segA === 'string' && typeof segB === 'string') {
            const cmp = segA.localeCompare(segB);
            if (cmp !== 0) return cmp;
        }
    }

    return 0;
}

/**
 * Sort routes by priority so that more specific routes match first.
 * Static routes come before dynamic routes at the same position.
 */
export function sortRoutesByPriority(routes: JayRoutes): JayRoutes {
    return [...routes].sort(compareRoutes);
}

/**
 * Check if a route has any dynamic segments (params).
 */
function hasDynamicSegments(route: JayRoute): boolean {
    return route.segments.some((seg) => typeof seg !== 'string');
}

/**
 * Check if a route is fully static (no dynamic segments).
 */
function isFullyStaticRoute(route: JayRoute): boolean {
    return route.segments.every((seg) => typeof seg === 'string');
}

/**
 * Check if a dynamic route pattern could match a static route.
 * For each segment position:
 * - If the dynamic route has a static segment, it must match the static route's segment
 * - If the dynamic route has a param, it can match any static value
 *
 * Example:
 *   static:  ['products', 'ceramic-flower-vase']
 *   dynamic: ['products', { name: 'slug' }]
 *   → true (products matches, [slug] can match 'ceramic-flower-vase')
 */
function dynamicRouteCouldMatch(staticRoute: JayRoute, dynamicRoute: JayRoute): boolean {
    if (staticRoute.segments.length !== dynamicRoute.segments.length) return false;
    if (staticRoute.segments.length === 0) return false;

    for (let i = 0; i < staticRoute.segments.length; i++) {
        const staticSeg = staticRoute.segments[i];
        const dynSeg = dynamicRoute.segments[i];

        // Static route should only have string segments
        if (typeof staticSeg !== 'string') return false;

        // If dynamic route has a static segment at this position, it must match
        if (typeof dynSeg === 'string') {
            if (staticSeg !== dynSeg) return false;
        }
        // If dynamic route has a param, it can match any value - continue
    }

    return true;
}

/**
 * Result of param inference for logging/debugging.
 */
export interface ParamInferenceResult {
    staticRoute: string;
    dynamicRoute: string;
    inferredParams: Record<string, string>;
}

/**
 * Infer params for static routes based on sibling dynamic routes.
 *
 * For each fully-static route, find a sibling dynamic route and map
 * the static segment values to the param names from the dynamic route.
 *
 * Example:
 *   /products/ceramic-flower-vase (static)
 *   /products/[slug] (dynamic sibling)
 *   → inferredParams: { slug: 'ceramic-flower-vase' }
 *
 * Returns the routes with inferred params added, plus an inference log.
 */
export function inferParamsForStaticRoutes(routes: JayRoutes): {
    routes: JayRoutes;
    inferenceLog: ParamInferenceResult[];
} {
    const inferenceLog: ParamInferenceResult[] = [];

    // Find all dynamic routes for quick lookup
    const dynamicRoutes = routes.filter(hasDynamicSegments);

    const enrichedRoutes = routes.map((route) => {
        // Skip if not fully static (has its own params)
        if (!isFullyStaticRoute(route)) return route;

        // Skip root route
        if (route.segments.length === 0) return route;

        // Find a dynamic route that could match this static route
        const dynamicSibling = dynamicRoutes.find((dyn) => dynamicRouteCouldMatch(route, dyn));

        if (!dynamicSibling) return route;

        // Build inferred params by comparing segment-by-segment
        const inferredParams: Record<string, string> = {};

        for (let i = 0; i < route.segments.length; i++) {
            const staticSeg = route.segments[i];
            const dynSeg = dynamicSibling.segments[i];

            // If static segment corresponds to a param in the dynamic route
            if (typeof staticSeg === 'string' && typeof dynSeg !== 'string') {
                inferredParams[dynSeg.name] = staticSeg;
            }
        }

        // Only add if we found any params to infer
        if (Object.keys(inferredParams).length === 0) return route;

        // Log the inference
        inferenceLog.push({
            staticRoute: route.rawRoute,
            dynamicRoute: dynamicSibling.rawRoute,
            inferredParams,
        });

        return { ...route, inferredParams };
    });

    return { routes: enrichedRoutes, inferenceLog };
}

export async function scanRoutes(baseDir: string, options: ScanFilesOptions): Promise<JayRoutes> {
    // Normalize base directory path
    const BASE_DIR = path.resolve(baseDir);

    const routes = await scanDirectory(BASE_DIR, BASE_DIR, options);
    const sortedRoutes = sortRoutesByPriority(routes);

    // Infer params for static override routes
    const { routes: enrichedRoutes, inferenceLog } = inferParamsForStaticRoutes(sortedRoutes);

    // Log inferred params for debugging (can be disabled in production)
    if (inferenceLog.length > 0) {
        getLogger().info('[route-scanner] Inferred params for static override routes:');
        for (const entry of inferenceLog) {
            getLogger().info(
                `  ${entry.staticRoute} → params from ${entry.dynamicRoute}: ${JSON.stringify(entry.inferredParams)}`,
            );
        }
    }

    return enrichedRoutes;
}
