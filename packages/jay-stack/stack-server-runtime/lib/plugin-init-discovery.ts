/**
 * Plugin initialization discovery and execution for Jay Stack.
 *
 * Discovers plugins with init configurations, sorts them by dependencies,
 * and executes their init functions in order.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import {
    loadPluginManifest,
    normalizePluginInitConfig,
    type PluginManifest,
    type NormalizedPluginInitConfig,
} from '@jay-framework/compiler-shared';

const require = createRequire(import.meta.url);

/**
 * Vite server interface for SSR module loading.
 */
export interface ViteSSRLoader {
    ssrLoadModule: (url: string) => Promise<Record<string, any>>;
}

/**
 * Information about a discovered plugin with init.
 */
export interface PluginWithInit {
    /** Plugin name from plugin.yaml */
    name: string;
    /** Plugin path (directory containing plugin.yaml) */
    pluginPath: string;
    /** Package name for NPM plugins, or path for local plugins */
    packageName: string;
    /** Whether this is a local plugin (src/plugins/) or NPM */
    isLocal: boolean;
    /** Server init config (normalized) */
    serverInit: NormalizedPluginInitConfig | null;
    /** Client init config (normalized) */
    clientInit: NormalizedPluginInitConfig | null;
    /** Dependencies from package.json (for ordering) */
    dependencies: string[];
}

/**
 * Options for plugin init discovery.
 */
export interface PluginInitDiscoveryOptions {
    /** Project root directory */
    projectRoot: string;
    /** Whether to log discovery progress */
    verbose?: boolean;
}

/**
 * Discovers all plugins with init configurations.
 *
 * Scans both local plugins (src/plugins/) and NPM plugins (node_modules/)
 * for plugin.yaml files with init configurations.
 */
export async function discoverPluginsWithInit(
    options: PluginInitDiscoveryOptions,
): Promise<PluginWithInit[]> {
    const { projectRoot, verbose = false } = options;
    const plugins: PluginWithInit[] = [];

    // 1. Scan local plugins in src/plugins/
    const localPluginsPath = path.join(projectRoot, 'src/plugins');
    if (fs.existsSync(localPluginsPath)) {
        try {
            const entries = fs.readdirSync(localPluginsPath, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const pluginPath = path.join(localPluginsPath, entry.name);
                const manifest = loadPluginManifest(pluginPath);

                if (manifest?.init) {
                    const serverInit = normalizePluginInitConfig(manifest.init.server, 'server');
                    const clientInit = normalizePluginInitConfig(manifest.init.client, 'client');

                    if (serverInit || clientInit) {
                        const dependencies = await getPackageDependencies(pluginPath);

                        plugins.push({
                            name: manifest.name || entry.name,
                            pluginPath,
                            packageName: pluginPath, // For local, use path
                            isLocal: true,
                            serverInit,
                            clientInit,
                            dependencies,
                        });

                        if (verbose) {
                            console.log(
                                `[PluginInit] Found local plugin with init: ${manifest.name || entry.name}`,
                            );
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`[PluginInit] Failed to scan local plugins: ${error}`);
        }
    }

    // 2. Scan NPM plugins by looking at project's package.json dependencies
    const projectPackageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(projectPackageJsonPath)) {
        try {
            const projectPackageJson = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf-8'));
            const allDeps = {
                ...projectPackageJson.dependencies,
                ...projectPackageJson.devDependencies,
            };

            for (const depName of Object.keys(allDeps)) {
                // Try to resolve plugin.yaml from the package
                let pluginYamlPath: string;
                try {
                    pluginYamlPath = require.resolve(`${depName}/plugin.yaml`, {
                        paths: [projectRoot],
                    });
                } catch {
                    // Not a Jay plugin, skip
                    continue;
                }

                const pluginPath = path.dirname(pluginYamlPath);
                const manifest = loadPluginManifest(pluginPath);

                if (manifest?.init) {
                    const serverInit = normalizePluginInitConfig(manifest.init.server, 'server');
                    const clientInit = normalizePluginInitConfig(manifest.init.client, 'client');

                    if (serverInit || clientInit) {
                        const dependencies = await getPackageDependencies(pluginPath);

                        plugins.push({
                            name: manifest.name || depName,
                            pluginPath,
                            packageName: depName,
                            isLocal: false,
                            serverInit,
                            clientInit,
                            dependencies,
                        });

                        if (verbose) {
                            console.log(`[PluginInit] Found NPM plugin with init: ${depName}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`[PluginInit] Failed to scan NPM plugins: ${error}`);
        }
    }

    return plugins;
}

/**
 * Gets dependencies from a package's package.json.
 */
async function getPackageDependencies(pluginPath: string): Promise<string[]> {
    const packageJsonPath = path.join(pluginPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return [];
    }

    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return Object.keys(packageJson.dependencies || {});
    } catch {
        return [];
    }
}

/**
 * Sorts plugins by their dependencies (topological sort).
 * Plugins with no dependencies come first, then plugins that depend on them, etc.
 */
export function sortPluginsByDependencies(plugins: PluginWithInit[]): PluginWithInit[] {
    const pluginNames = new Set(plugins.map((p) => p.packageName));
    const sorted: PluginWithInit[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    function visit(plugin: PluginWithInit) {
        if (visited.has(plugin.packageName)) return;
        if (visiting.has(plugin.packageName)) {
            console.warn(`[PluginInit] Circular dependency detected for ${plugin.name}`);
            return;
        }

        visiting.add(plugin.packageName);

        // Visit dependencies first (only those that are also plugins with init)
        for (const dep of plugin.dependencies) {
            if (pluginNames.has(dep)) {
                const depPlugin = plugins.find((p) => p.packageName === dep);
                if (depPlugin) {
                    visit(depPlugin);
                }
            }
        }

        visiting.delete(plugin.packageName);
        visited.add(plugin.packageName);
        sorted.push(plugin);
    }

    for (const plugin of plugins) {
        visit(plugin);
    }

    return sorted;
}

/**
 * Context passed to plugin init functions.
 */
export interface PluginInitContext {
    /** Plugin name (for namespacing client init data) */
    pluginName: string;
}

/**
 * Executes server init for all plugins in order.
 * Each plugin's init function receives a context with the plugin name,
 * which should be used as the key for setClientInitData.
 *
 * @param plugins - Sorted list of plugins with init
 * @param viteServer - Vite server for SSR module loading (optional)
 * @param verbose - Whether to log progress
 */
export async function executePluginServerInits(
    plugins: PluginWithInit[],
    viteServer?: ViteSSRLoader,
    verbose: boolean = false,
): Promise<void> {
    for (const plugin of plugins) {
        if (!plugin.serverInit) continue;

        try {
            const modulePath = plugin.isLocal
                ? path.join(plugin.pluginPath, plugin.serverInit.module)
                : plugin.packageName; // For NPM, import the package directly

            let pluginModule: Record<string, any>;

            if (viteServer) {
                // In dev mode, use Vite's SSR loader for TypeScript support
                if (plugin.isLocal) {
                    pluginModule = await viteServer.ssrLoadModule(modulePath);
                } else {
                    // For NPM packages, load the main export
                    pluginModule = await viteServer.ssrLoadModule(plugin.packageName);
                }
            } else {
                // Production: use native import
                pluginModule = await import(modulePath);
            }

            const initFn = pluginModule[plugin.serverInit.export];

            if (typeof initFn === 'function') {
                if (verbose) {
                    console.log(`[PluginInit] Executing server init for: ${plugin.name}`);
                }
                // Pass context with plugin name for namespacing
                const context: PluginInitContext = { pluginName: plugin.name };
                await initFn(context);
            } else {
                console.warn(
                    `[PluginInit] Plugin "${plugin.name}" declares server init but "${plugin.serverInit.export}" is not a function`,
                );
            }
        } catch (error) {
            console.error(`[PluginInit] Failed to execute server init for "${plugin.name}":`, error);
        }
    }
}

