import {promises as fs} from 'fs';
import path from 'path';

export enum JayRouteParamType {
    single,
    catchAll,
    optional
}
export interface JayRouteParam {
    name: string,
    type: JayRouteParamType
}
export type JayRouteSegment = string | JayRouteParam
export type JayRoute = {
    segments: JayRouteSegment[],
    filePath: string
}
export type JayRoutes = JayRoute[]

// Regex pattern:
// ^\[        - Starts with [
// (\[)?      - Optional second [ (for optional params)
// (\.\.\.)?  - Optional ... (for catch-all)
// ([^\]]+)   - Capture the name (one or more characters that aren't ])
// \]?        - Optional closing ] (matches the optional opening [)
// \]$        - Ends with ]
const PARSE_PARAM = /^\[(\[)?(\.\.\.)?([^\]]+)\]?\]$/;


function convertToRoutePath(BASE_DIR: string, filePath: string, fileNameToRoute: string): JayRoute {
    let routePath = filePath
        .replace(BASE_DIR, '')
        .replace(`/${fileNameToRoute}`, '')
        .replace('\\', '/'); // Normalize Windows paths

    // Handle parameters in folder names
    const segments: JayRouteSegment[] = routePath
        .split('/')
        .filter(segment => segment.length > 0)
        .map(segment => {
            const match = segment.match(PARSE_PARAM);
            if (!match)
                return segment;
            const isParam = true;
            const isOptional = !!match[1];    // True if there's an opening [[
            const isCatchAll = !!match[2];    // True if there's ...
            const name = match[3];
            if (isParam)
                return {
                    name,
                    type: isOptional? JayRouteParamType.optional :
                        isCatchAll ? JayRouteParamType.catchAll : JayRouteParamType.single
                }
            else return name
        })

    return { segments, filePath }
}

async function scanDirectory(BASE_DIR: string, directory: string, fileNameToRoute: string): Promise<JayRoutes> {
    let routes: JayRoutes = []
    const items = await fs.readdir(directory, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(directory, item.name);

        if (item.isDirectory()) {
            routes = [...routes, ...await scanDirectory(BASE_DIR, fullPath, fileNameToRoute)];
        } else if (item.name === fileNameToRoute) {
            const route = convertToRoutePath(BASE_DIR, fullPath, fileNameToRoute);
            routes.push(route);
        }
    }
    return routes;
}

export async function scanRoutes(baseDir: string, fileNameToRoute: string): Promise<JayRoutes> {
    // Normalize base directory path
    const BASE_DIR = path.resolve(baseDir);

    return await scanDirectory(BASE_DIR, BASE_DIR, fileNameToRoute);
}