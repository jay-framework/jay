/**
 * Plugin Scanner
 *
 * Shared utility for scanning Jay plugins in a project.
 * Used by both plugin-init-discovery and contract-materializer.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { loadPluginManifest, type PluginManifest } from '@jay-framework/compiler-shared';

const require = createRequire(import.meta.url);

/**
 * Basic plugin information from scanning.
 */
export interface ScannedPlugin {
    /** Plugin name (from plugin.yaml or directory/package name) */
    name: string;
    /** Full path to plugin directory */
    pluginPath: string;
    /** Package name for NPM plugins, or directory name for local plugins */
    packageName: string;
    /** Whether this is a local plugin (src/plugins/) or NPM package */
    isLocal: boolean;
    /** Parsed plugin.yaml manifest */
    manifest: PluginManifest;
    /** Dependencies from package.json (for ordering) */
    dependencies: string[];
}

/**
 * Options for plugin scanning.
 */
export interface PluginScanOptions {
    /** Project root directory */
    projectRoot: string;
    /** Whether to log discovery progress */
    verbose?: boolean;
    /** Whether to include dev dependencies (default: false) */
    includeDevDeps?: boolean;
    /** Whether to discover transitive plugin dependencies (default: false) */
    discoverTransitive?: boolean;
}

/**
 * Scans for all Jay plugins in a project.
 *
 * Scans both local plugins (src/plugins/) and NPM plugins (node_modules/).
 * Returns basic plugin information that can be used by different consumers
 * (init discovery, contract materialization, etc.)
 *
 * @param options - Scanning options
 * @returns Map of package/directory name to plugin info
 */
export async function scanPlugins(options: PluginScanOptions): Promise<Map<string, ScannedPlugin>> {
    const {
        projectRoot,
        verbose = false,
        includeDevDeps = false,
        discoverTransitive = false,
    } = options;

    const plugins = new Map<string, ScannedPlugin>();
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

                const dependencies = await getPackageDependencies(pluginPath);
                const pluginName = manifest.name || entry.name;

                plugins.set(entry.name, {
                    name: pluginName,
                    pluginPath,
                    packageName: pluginPath, // For local, use path as identifier
                    isLocal: true,
                    manifest,
                    dependencies,
                });

                visitedPackages.add(pluginPath);

                if (verbose) {
                    console.log(`[PluginScanner] Found local plugin: ${pluginName}`);
                }
            }
        } catch (error) {
            if (verbose) {
                console.warn(`[PluginScanner] Failed to scan local plugins: ${error}`);
            }
        }
    }

    // 2. Scan NPM plugins from package.json dependencies
    const projectPackageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(projectPackageJsonPath)) {
        try {
            const projectPackageJson = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf-8'));

            // Collect dependencies to scan
            const deps = {
                ...projectPackageJson.dependencies,
                ...(includeDevDeps ? projectPackageJson.devDependencies : {}),
            };

            // Queue-based traversal for transitive dependencies (if enabled)
            const packagesToCheck = Object.keys(deps);

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

                const dependencies = await getPackageDependencies(pluginPath);

                plugins.set(depName, {
                    name: manifest.name || depName,
                    pluginPath,
                    packageName: depName,
                    isLocal: false,
                    manifest,
                    dependencies,
                });

                if (verbose) {
                    console.log(`[PluginScanner] Found NPM plugin: ${depName}`);
                }

                // Add transitive dependencies to queue if enabled
                if (discoverTransitive) {
                    for (const transitiveDep of dependencies) {
                        if (!visitedPackages.has(transitiveDep)) {
                            packagesToCheck.push(transitiveDep);
                        }
                    }
                }
            }
        } catch (error) {
            if (verbose) {
                console.warn(`[PluginScanner] Failed to scan NPM plugins: ${error}`);
            }
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
