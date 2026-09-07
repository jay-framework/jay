import type {
    RouteManifest,
    RouteEntry,
    RouteSegment,
    ActionEntry,
    PluginEntry,
} from '@jay-framework/production-server';
import {
    type JayRoute,
    type JayRouteSegment,
    JayRouteParamType,
} from '@jay-framework/stack-route-scanner';
import { extractActionsFromSource } from '@jay-framework/compiler-jay-stack';
import { scanPlugins } from '@jay-framework/stack-server-runtime';
import { normalizeActionEntry } from '@jay-framework/compiler-shared';
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

export function buildRouteEntry(route: JayRoute, serverModulePath: string): RouteEntry {
    return {
        pattern: route.rawRoute,
        segments: convertSegments(route.segments),
        serverModule: serverModulePath,
        componentExport: route.componentExport,
        instances: [],
        ...(route.devOnly && { devOnly: true }),
    };
}

export async function discoverActions(
    actionPaths: Record<string, string>,
    serverOutputDir: string,
    buildDir: string,
    projectRoot: string,
): Promise<{ actions: ActionEntry[]; plugins: PluginEntry[] }> {
    const actions: ActionEntry[] = [];
    const plugins: PluginEntry[] = [];

    // Project actions
    for (const [entryName, sourcePath] of Object.entries(actionPaths)) {
        try {
            const code = await fs.readFile(sourcePath, 'utf-8');
            const extracted = extractActionsFromSource(code, sourcePath);
            if (extracted.length > 0) {
                actions.push({
                    serverModule: path.relative(
                        buildDir,
                        path.join(serverOutputDir, entryName + '.js'),
                    ),
                    isPlugin: false,
                    actionNames: extracted.map((a) => a.actionName),
                });
            }
        } catch {
            getLogger().warn(`[Build] Could not extract actions from ${sourcePath}`);
        }
    }

    // NPM plugin actions (from plugin.yaml declarations)
    try {
        const scannedPlugins = await scanPlugins({ projectRoot });
        for (const [packageName, plugin] of scannedPlugins) {
            if (plugin.isLocal) continue;
            plugins.push({ name: plugin.manifest.name, packageName });
            const pluginActions = plugin.manifest.actions;
            if (pluginActions && pluginActions.length > 0) {
                // DL#180: devOnly actions are dev/tools-only surfaces — their handlers live in the
                // plugin's `./tools` entry (not on `.`) and must never be dispatchable in production.
                // Exclude them from the deploy manifest so production never traces or serves them.
                const productionActions = pluginActions
                    .map(normalizeActionEntry)
                    .filter((a) => !a.devOnly);
                const devOnlyCount = pluginActions.length - productionActions.length;
                if (productionActions.length > 0) {
                    actions.push({
                        serverModule: '',
                        packageName,
                        isPlugin: true,
                        actionNames: productionActions.map((a) => a.name),
                    });
                }
                getLogger().info(
                    `[Build] Plugin actions from ${packageName}: ${productionActions.length}` +
                        (devOnlyCount > 0 ? ` (excluded ${devOnlyCount} devOnly)` : ''),
                );
            }
        }
    } catch (err: any) {
        getLogger().warn(`[Build] Plugin action scan failed: ${err.message}`);
    }

    return { actions, plugins };
}

export async function writeRouteManifest(manifest: RouteManifest, buildDir: string): Promise<void> {
    const manifestPath = path.join(buildDir, 'route-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    getLogger().info(
        `[Build] Route manifest written: ${manifest.routes.length} routes, ${manifest.routes.reduce((n, r) => n + r.instances.length, 0)} instances`,
    );
}
