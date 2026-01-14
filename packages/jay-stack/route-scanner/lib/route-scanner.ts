import { promises as fs } from 'fs';
import path from 'path';

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

export async function scanRoutes(baseDir: string, options: ScanFilesOptions): Promise<JayRoutes> {
    // Normalize base directory path
    const BASE_DIR = path.resolve(baseDir);

    const routes = await scanDirectory(BASE_DIR, BASE_DIR, options);
    return sortRoutesByPriority(routes);
}
