import type { RouteManifest, RouteEntry, RouteSegment, ActionEntry } from '../types';
import { type JayRoute, type JayRouteSegment, JayRouteParamType } from '@jay-framework/stack-route-scanner';
import { extractActionsFromSource } from '@jay-framework/compiler-jay-stack';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

function convertSegments(segments: JayRouteSegment[]): RouteSegment[] {
    return segments.map((s): RouteSegment => {
        if (typeof s === 'string') {
            return { type: 'static', value: s };
        }
        switch (s.type) {
            case JayRouteParamType.single:
                return { type: 'param', value: s.name };
            case JayRouteParamType.catchAll:
                return { type: 'catchAll', value: s.name };
            case JayRouteParamType.optional:
                return { type: 'optional', value: s.name };
        }
    });
}

export function buildRouteEntry(
    route: JayRoute,
    serverModulePath: string,
): RouteEntry {
    return {
        pattern: route.rawRoute,
        segments: convertSegments(route.segments),
        serverModule: serverModulePath,
        jayHtmlPath: route.jayHtmlPath,
        instances: [],
    };
}

export async function discoverActions(
    actionPaths: Record<string, string>,
    serverOutputDir: string,
    buildDir: string,
): Promise<ActionEntry[]> {
    const actions: ActionEntry[] = [];

    for (const [entryName, sourcePath] of Object.entries(actionPaths)) {
        try {
            const code = await fs.readFile(sourcePath, 'utf-8');
            const extracted = extractActionsFromSource(code, sourcePath);
            if (extracted.length > 0) {
                actions.push({
                    serverModule: path.relative(buildDir, path.join(serverOutputDir, entryName + '.js')),
                    isPlugin: false,
                    actionNames: extracted.map((a) => a.actionName),
                });
            }
        } catch {
            getLogger().warn(`[Build] Could not extract actions from ${sourcePath}`);
        }
    }

    return actions;
}

export async function writeRouteManifest(
    manifest: RouteManifest,
    buildDir: string,
): Promise<void> {
    const manifestPath = path.join(buildDir, 'route-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    getLogger().info(`[Build] Route manifest written: ${manifest.routes.length} routes, ${manifest.routes.reduce((n, r) => n + r.instances.length, 0)} instances`);
}
