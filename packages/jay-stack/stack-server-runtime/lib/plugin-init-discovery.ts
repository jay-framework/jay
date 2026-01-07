/**
 * Plugin initialization discovery and execution for Jay Stack.
 *
 * Discovers plugins with init configurations (using makeJayInit pattern),
 * sorts them by dependencies, and executes their init functions in order.
 *
 * Auto-discovers `lib/init.ts` files in plugins, or uses the path specified
 * in `plugin.yaml` via the `init` property.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { loadPluginManifest } from '@jay-framework/compiler-shared';
import type { JayInit } from '@jay-framework/fullstack-component';
import type { ViteSSRLoader } from './action-discovery';
import { setClientInitData } from './services';

const require = createRequire(import.meta.url);

/**
 * Information about a discovered plugin with init.
 */
export interface PluginWithInit {
    /** Plugin name from plugin.yaml (used as default init key) */
    name: string;
    /** Plugin path (directory containing plugin.yaml) */
    pluginPath: string;
    /** Package name for NPM plugins, or path for local plugins */
    packageName: string;
    /** Whether this is a local plugin (src/plugins/) or NPM */
    isLocal: boolean;
    /**
     * Init module path relative to plugin root.
     * Default is 'lib/init' (auto-discovered).
     * Can be overridden via `init` property in plugin.yaml.
     */
    initModule: string;
    /**
     * Export name for the init constant.
     * Default is 'init'.
     * Can be overridden via `init` property in plugin.yaml (for compiled packages).
     */
    initExport: string;
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
 * Auto-discovers `lib/init.ts` files in plugins, or uses the path specified
 * in `plugin.yaml` via the `init` property.
 *
 * Scans both local plugins (src/plugins/) and NPM plugins (node_modules/).
 * Also discovers transitive plugin dependencies (plugins that depend on other plugins).
 */
export async function discoverPluginsWithInit(
    options: PluginInitDiscoveryOptions,
): Promise<PluginWithInit[]> {
    const { projectRoot, verbose = false } = options;
    const plugins: PluginWithInit[] = [];
    const visitedPackages = new Set<string>();

    // 1. Scan local plugins in src/plugins/
    const localPluginsPath = path.join(projectRoot, 'src/plugins');
    if (fs.existsSync(localPluginsPath)) {
        try {
            const entries = fs.readdirSync(localPluginsPath, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const pluginPath = path.join(localPluginsPath, entry.name);
                const manifest = loadPluginManifest(pluginPath);

                if (!manifest) continue;

                // Determine init module and export
                const initConfig = resolvePluginInit(pluginPath, manifest.init, true);
                if (!initConfig) continue;

                const dependencies = await getPackageDependencies(pluginPath);

                plugins.push({
                    name: manifest.name || entry.name,
                    pluginPath,
                    packageName: pluginPath, // For local, use path
                    isLocal: true,
                    initModule: initConfig.module,
                    initExport: initConfig.export,
                    dependencies,
                });

                visitedPackages.add(pluginPath);

                if (verbose) {
                    console.log(
                        `[PluginInit] Found local plugin with init: ${manifest.name || entry.name}`,
                    );
                }
            }
        } catch (error) {
            console.warn(`[PluginInit] Failed to scan local plugins: ${error}`);
        }
    }

    // 2. Scan NPM plugins - start with project's package.json dependencies
    //    then recursively check transitive plugin dependencies
    const projectPackageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(projectPackageJsonPath)) {
        try {
            const projectPackageJson = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf-8'));
            // Only check runtime dependencies, not devDependencies
            // devDependencies are build tools, not runtime plugins
            const initialDeps = Object.keys(projectPackageJson.dependencies || {});

            // Queue-based traversal for transitive dependencies
            const packagesToCheck = [...initialDeps];

            while (packagesToCheck.length > 0) {
                const depName = packagesToCheck.shift()!;

                // Skip if already visited
                if (visitedPackages.has(depName)) continue;
                visitedPackages.add(depName);

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

                if (!manifest) continue;

                // Determine init module and export
                const initConfig = resolvePluginInit(pluginPath, manifest.init, false);
                if (!initConfig) continue;

                const dependencies = await getPackageDependencies(pluginPath);

                plugins.push({
                    name: manifest.name || depName,
                    pluginPath,
                    packageName: depName,
                    isLocal: false,
                    initModule: initConfig.module,
                    initExport: initConfig.export,
                    dependencies,
                });

                if (verbose) {
                    console.log(`[PluginInit] Found NPM plugin with init: ${depName}`);
                }

                // Add this plugin's dependencies to the queue for transitive discovery
                for (const transitiveDep of dependencies) {
                    if (!visitedPackages.has(transitiveDep)) {
                        packagesToCheck.push(transitiveDep);
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
 * Resolves plugin init configuration.
 *
 * For LOCAL plugins (development):
 * - Auto-discovers `lib/init.ts` or `init.ts`
 * - Module path points to the actual file
 *
 * For NPM plugins (compiled packages):
 * - Init is exported from the main package entry (dist/index.js)
 * - Module path is empty (import directly from package)
 * - `init` in plugin.yaml can override the export name
 *
 * Returns null if no init is found.
 */
function resolvePluginInit(
    pluginPath: string,
    initConfig: string | undefined,
    isLocal: boolean,
): { module: string; export: string } | null {
    const defaultExport = 'init';

    if (isLocal) {
        // For local plugins, look for actual init files
        const initPaths = [
            path.join(pluginPath, 'lib/init.ts'),
            path.join(pluginPath, 'lib/init.js'),
            path.join(pluginPath, 'init.ts'),
            path.join(pluginPath, 'init.js'),
        ];

        for (const initPath of initPaths) {
            if (fs.existsSync(initPath)) {
                // Return relative path from plugin root
                const relativePath = path.relative(pluginPath, initPath);
                const modulePath = relativePath.replace(/\.(ts|js)$/, '');
                const exportName = typeof initConfig === 'string' ? initConfig : defaultExport;
                return { module: modulePath, export: exportName };
            }
        }

        // No init file found for local plugin
        return null;
    }

    // For NPM plugins (compiled), init is exported from main package entry
    // Check if package.json exists and has proper exports
    const packageJsonPath = path.join(pluginPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return null;
    }

    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

        // Check if this package exports 'init' (or custom name from plugin.yaml)
        // This is a heuristic - the actual export check happens at runtime
        const hasMain = packageJson.main || packageJson.exports;
        if (!hasMain && !initConfig) {
            return null;
        }

        // For NPM packages, module path is empty (import from package root)
        // Export name comes from plugin.yaml or defaults to 'init'
        const exportName = typeof initConfig === 'string' ? initConfig : defaultExport;
        return { module: '', export: exportName };
    } catch {
        return null;
    }
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
 * Executes server init for all plugins in order.
 *
 * Uses the `makeJayInit` pattern:
 * - Loads the init module and finds the JayInit object
 * - Calls `_serverInit()` if defined
 * - Stores returned data via `setClientInitData(pluginName, data)`
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
        try {
            // Build the module path
            let modulePath: string;

            if (plugin.isLocal) {
                // Local plugins: full path to the init file
                modulePath = path.join(plugin.pluginPath, plugin.initModule);
            } else if (plugin.initModule) {
                // NPM plugins with sub-path
                modulePath = `${plugin.packageName}/${plugin.initModule}`;
            } else {
                // NPM plugins: import from package root (init exported from main bundle)
                modulePath = plugin.packageName;
            }

            let pluginModule: Record<string, any>;

            if (viteServer) {
                // In dev mode, use Vite's SSR loader for TypeScript support
                pluginModule = await viteServer.ssrLoadModule(modulePath);
            } else {
                // Production: use native import
                pluginModule = await import(modulePath);
            }

            const jayInit = pluginModule[plugin.initExport] as JayInit<any> | undefined;

            if (!jayInit || jayInit.__brand !== 'JayInit') {
                console.warn(
                    `[PluginInit] Plugin "${plugin.name}" init module doesn't export a valid JayInit at "${plugin.initExport}"`,
                );
                continue;
            }

            // Execute server init if defined
            if (typeof jayInit._serverInit === 'function') {
                if (verbose) {
                    console.log(`[DevServer] Running server init: ${plugin.name}`);
                }

                // Run server init and capture returned data
                const clientData = await jayInit._serverInit();

                // Store client data if server init returned something
                if (clientData !== undefined && clientData !== null) {
                    // Use plugin name as the key (it's also the default for JayInit.key)
                    setClientInitData(plugin.name, clientData);
                }
            }
        } catch (error) {
            console.error(
                `[PluginInit] Failed to execute server init for "${plugin.name}":`,
                error,
            );
        }
    }
}

/**
 * Information needed to generate client init script for a plugin.
 */
export interface PluginClientInitInfo {
    /** Plugin name (used for logging and as data key) */
    name: string;
    /** Import path for the init module */
    importPath: string;
    /** Export name for the JayInit constant */
    initExport: string;
}

/**
 * Prepares plugin information for client init script generation.
 *
 * For LOCAL plugins: Use the init file path directly
 * For NPM plugins: Use the `/client` subpath (client bundle exports init)
 *
 * Filters to only plugins that have init modules and returns the
 * information needed to generate client-side imports and execution.
 */
export function preparePluginClientInits(plugins: PluginWithInit[]): PluginClientInitInfo[] {
    return plugins.map((plugin) => {
        let importPath: string;

        if (plugin.isLocal) {
            // Local plugins: full path to the init file
            importPath = path.join(plugin.pluginPath, plugin.initModule);
        } else if (plugin.initModule) {
            // NPM plugins with explicit sub-path
            importPath = `${plugin.packageName}/${plugin.initModule}`;
        } else {
            // NPM plugins: import from /client subpath (client bundle)
            importPath = `${plugin.packageName}/client`;
        }

        return {
            name: plugin.name,
            importPath,
            initExport: plugin.initExport,
        };
    });
}
