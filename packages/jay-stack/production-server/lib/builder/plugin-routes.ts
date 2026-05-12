import { scanPlugins } from '@jay-framework/stack-server-runtime';
import { parseRouteSegments, type JayRoute, type JayRoutes } from '@jay-framework/stack-route-scanner';
import { getLogger } from '@jay-framework/logger';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

export async function scanPluginRoutes(
    projectRoot: string,
    projectRoutes: JayRoutes,
): Promise<JayRoutes> {
    const logger = getLogger();
    const plugins = await scanPlugins({ projectRoot });
    const projectPaths = new Set(projectRoutes.map((r) => r.rawRoute));
    const pluginRoutes: JayRoutes = [];

    for (const [, plugin] of plugins) {
        if (plugin.isLocal) continue;
        if (!plugin.manifest.routes) continue;

        for (const route of plugin.manifest.routes) {
            if (projectPaths.has(route.path)) {
                logger.info(`[Routes] Plugin "${plugin.manifest.name}" route ${route.path} skipped — project route takes precedence`);
                continue;
            }

            const jayHtmlPath = resolvePluginExport(plugin.pluginPath, route.jayHtml);
            if (!jayHtmlPath) {
                logger.warn(`[Routes] Plugin "${plugin.manifest.name}" route ${route.path}: jayHtml "${route.jayHtml}" not found`);
                continue;
            }

            const compPath = resolvePluginModule(plugin.pluginPath);
            const componentExport = route.component;

            pluginRoutes.push({
                segments: parseRouteSegments(route.path),
                rawRoute: route.path,
                jayHtmlPath,
                compPath,
                componentExport,
            });

            logger.info(`[Routes] Plugin "${plugin.manifest.name}" provides route ${route.path}`);
        }
    }

    return pluginRoutes;
}

function resolvePluginExport(pluginPath: string, exportSubpath: string): string | undefined {
    const normalized = exportSubpath.replace(/^\.\//, '');
    const packageJsonPath = path.join(pluginPath, 'package.json');
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.exports) {
            const exportKey = './' + normalized;
            const exportValue = packageJson.exports[exportKey];
            if (exportValue) {
                const resolved =
                    typeof exportValue === 'string'
                        ? exportValue
                        : exportValue.default || exportValue.import || exportValue.require;
                if (resolved) return path.join(pluginPath, resolved);
            }
        }
    } catch { /* skip */ }

    for (const dir of ['dist', 'lib', '']) {
        const candidate = path.join(pluginPath, dir, normalized);
        try {
            fs.accessSync(candidate);
            return candidate;
        } catch { /* skip */ }
    }
    return undefined;
}

function resolvePluginModule(pluginPath: string): string {
    const pkgJsonPath = path.join(pluginPath, 'package.json');
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        const mainExport = pkg.exports?.['.'];
        const mainPath =
            typeof mainExport === 'string'
                ? mainExport
                : mainExport?.default || mainExport?.import || pkg.main;
        if (mainPath) {
            const resolved = path.join(pluginPath, mainPath);
            if (fs.existsSync(resolved)) return resolved;
        }
    } catch { /* skip */ }

    return path.join(pluginPath, 'dist', 'index.js');
}
