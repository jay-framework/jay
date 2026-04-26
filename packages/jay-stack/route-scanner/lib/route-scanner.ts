import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { parse } from 'node-html-parser';
import YAML from 'yaml';
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
     * Explicit params declared via <script type="application/jay-params"> in the jay-html.
     * Used by static override routes to provide param values.
     * e.g., /products/ceramic-flower-vase declares { slug: 'ceramic-flower-vase' }.
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

    const candidateCompPath = jayHtmlPath.replace(jayHtmlFilename, compFilename);
    const compPath = existsSync(candidateCompPath) ? candidateCompPath : '';
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
            // Read jay-html and extract explicit params from <script type="application/jay-params">
            const { params, validations } = await parseJayParams(fullPath);
            if (params) {
                route.inferredParams = params;
            }
            if (validations.length > 0) {
                for (const v of validations) {
                    getLogger().warn(`[route-scanner] ${route.rawRoute}: ${v}`);
                }
            }
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
 * Strip common leading whitespace from YAML embedded in HTML.
 * HTML indentation produces YAML lines with extra leading spaces that
 * confuse the YAML parser.
 */
function dedentYaml(text: string): string {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return '';
    const minIndent = Math.min(...lines.map((l) => l.match(/^\s*/)?.[0].length ?? 0));
    return lines.map((l) => l.slice(minIndent)).join('\n');
}

/**
 * Parse <script type="application/jay-params"> from a jay-html file.
 * Uses node-html-parser (same parser as the compiler) for robust parsing.
 * Returns the parsed params and any validation errors.
 *
 * @see Design Log #113
 */
async function parseJayParams(
    jayHtmlPath: string,
): Promise<{ params: Record<string, string> | undefined; validations: string[] }> {
    let content: string;
    try {
        content = await fs.readFile(jayHtmlPath, 'utf-8');
    } catch {
        return { params: undefined, validations: [] };
    }

    const root = parse(content, {
        comment: true,
        blockTextElements: { script: true, style: true },
    });
    const head = root.querySelector('head');
    const paramScripts = (head ?? root).querySelectorAll('script[type="application/jay-params"]');

    if (paramScripts.length === 0) return { params: undefined, validations: [] };

    if (paramScripts.length > 1) {
        return {
            params: undefined,
            validations: [
                'Multiple <script type="application/jay-params"> tags found — expected at most one',
            ],
        };
    }

    const body = dedentYaml(paramScripts[0].textContent ?? '');
    if (!body) return { params: undefined, validations: [] };

    try {
        return { params: YAML.parse(body), validations: [] };
    } catch (e) {
        return {
            params: undefined,
            validations: [`Failed to parse jay-params YAML: ${(e as Error).message}`],
        };
    }
}

/**
 * Parse a route path string into segments (DL#130).
 * Supports [param], [[optional]], [...catchAll] patterns.
 */
export function parseRouteSegments(routePath: string): JayRouteSegment[] {
    return routePath
        .split('/')
        .filter((s) => s.length > 0)
        .map((segment) => {
            const match = segment.match(PARSE_PARAM);
            if (!match) return segment;
            return {
                name: match[3],
                type: match[1]
                    ? JayRouteParamType.optional
                    : match[2]
                      ? JayRouteParamType.catchAll
                      : JayRouteParamType.single,
            } as JayRouteParam;
        });
}

/**
 * Create a JayRoute from explicit path and file locations (DL#130).
 * Used for plugin-provided routes where the path is declared, not inferred from the filesystem.
 */
export function createRoute(routePath: string, jayHtmlPath: string, compPath: string): JayRoute {
    return {
        segments: parseRouteSegments(routePath),
        rawRoute: routePath,
        jayHtmlPath,
        compPath,
    };
}

export async function scanRoutes(baseDir: string, options: ScanFilesOptions): Promise<JayRoutes> {
    // Normalize base directory path
    const BASE_DIR = path.resolve(baseDir);

    const routes = await scanDirectory(BASE_DIR, BASE_DIR, options);
    const sortedRoutes = sortRoutesByPriority(routes);

    // Log explicit params for debugging
    const routesWithParams = sortedRoutes.filter((r) => r.inferredParams);
    if (routesWithParams.length > 0) {
        getLogger().info('[route-scanner] Routes with explicit params (jay-params):');
        for (const route of routesWithParams) {
            getLogger().info(`  ${route.rawRoute} → ${JSON.stringify(route.inferredParams)}`);
        }
    }

    return sortedRoutes;
}
