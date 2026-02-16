/**
 * Action discovery and auto-registration for Jay Stack.
 *
 * Scans project and plugin directories to discover and register actions
 * automatically on server startup.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { ActionRegistry, actionRegistry } from './action-registry';
import { isJayAction } from '@jay-framework/fullstack-component';
import {
    loadPluginManifest,
    PluginManifest,
    normalizeActionEntry,
} from '@jay-framework/compiler-shared';
import { getLogger } from '@jay-framework/logger';
import { loadActionMetadata, resolveActionMetadataPath } from './action-metadata';

const require = createRequire(import.meta.url);

/**
 * Vite server interface for SSR module loading.
 * Using a minimal interface to avoid direct Vite dependency.
 */
export interface ViteSSRLoader {
    ssrLoadModule: (url: string) => Promise<Record<string, any>>;
}

/**
 * Options for action discovery.
 */
export interface ActionDiscoveryOptions {
    /** Project root directory */
    projectRoot: string;
    /** Custom actions directory (default: src/actions) */
    actionsDir?: string;
    /** Registry to register actions in (default: global actionRegistry) */
    registry?: ActionRegistry;
    /** Whether to log discovery progress */
    verbose?: boolean;
    /** Vite server for SSR module loading (required in dev for TypeScript files) */
    viteServer?: ViteSSRLoader;
}

/**
 * Result of action discovery.
 */
export interface ActionDiscoveryResult {
    /** Number of actions discovered and registered */
    actionCount: number;
    /** Names of registered actions */
    actionNames: string[];
    /** Paths of scanned action files */
    scannedFiles: string[];
}

/**
 * Discovers and registers actions from the project's actions directory.
 *
 * Scans `src/actions/*.actions.ts` for exported actions and registers them.
 *
 * @param options - Discovery options
 * @returns Result with discovered action information
 *
 * @example
 * ```typescript
 * // In dev-server startup
 * const result = await discoverAndRegisterActions({
 *     projectRoot: process.cwd(),
 *     verbose: true,
 * });
 * console.log(`Registered ${result.actionCount} actions`);
 * ```
 */
export async function discoverAndRegisterActions(
    options: ActionDiscoveryOptions,
): Promise<ActionDiscoveryResult> {
    const {
        projectRoot,
        actionsDir = 'src/actions',
        registry = actionRegistry,
        verbose = false,
        viteServer,
    } = options;

    const result: ActionDiscoveryResult = {
        actionCount: 0,
        actionNames: [],
        scannedFiles: [],
    };

    const actionsPath = path.resolve(projectRoot, actionsDir);

    // Check if actions directory exists
    if (!fs.existsSync(actionsPath)) {
        if (verbose) {
            getLogger().info(`[Actions] No actions directory found at ${actionsPath}`);
        }
        return result;
    }

    // Find all .actions.ts files
    const actionFiles = await findActionFiles(actionsPath);

    if (verbose) {
        getLogger().info(`[Actions] Found ${actionFiles.length} action file(s)`);
    }

    // Import and register each action file
    for (const filePath of actionFiles) {
        result.scannedFiles.push(filePath);

        try {
            // Dynamic import of the action module
            // Use Vite's SSR loader for TypeScript files in dev mode
            let module: Record<string, any>;
            if (viteServer) {
                module = await viteServer.ssrLoadModule(filePath);
            } else {
                // Production fallback: requires pre-compiled .js files
                module = await import(filePath);
            }

            // Find and register all JayAction exports
            for (const [exportName, exportValue] of Object.entries(module)) {
                if (isJayAction(exportValue)) {
                    registry.register(exportValue as any);
                    result.actionNames.push((exportValue as any).actionName);
                    result.actionCount++;

                    if (verbose) {
                        getLogger().info(
                            `[Actions] Registered: ${(exportValue as any).actionName}`,
                        );
                    }
                }
            }
        } catch (error) {
            getLogger().error(`[Actions] Failed to import ${filePath}: ${error}`);
        }
    }

    return result;
}

/**
 * Finds all .actions.ts files in a directory (recursive).
 */
async function findActionFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            // Recurse into subdirectories
            const subFiles = await findActionFiles(fullPath);
            files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.actions.ts')) {
            files.push(fullPath);
        }
    }

    return files;
}

/**
 * Options for discovering plugin actions.
 */
export interface PluginActionDiscoveryOptions {
    /** Project root directory */
    projectRoot: string;
    /** Registry to register actions in (default: global actionRegistry) */
    registry?: ActionRegistry;
    /** Whether to log discovery progress */
    verbose?: boolean;
    /** Vite server for SSR module loading (required in dev for TypeScript files) */
    viteServer?: ViteSSRLoader;
}

/**
 * Discovers and registers actions from all plugins in a project.
 *
 * Scans both local plugins (src/plugins/) and installed NPM plugins.
 *
 * @param options - Discovery options
 * @returns Array of registered action names
 */
export async function discoverAllPluginActions(
    options: PluginActionDiscoveryOptions,
): Promise<string[]> {
    const { projectRoot, registry = actionRegistry, verbose = false, viteServer } = options;
    const allActions: string[] = [];

    // Discover local plugins in src/plugins/
    const localPluginsPath = path.join(projectRoot, 'src/plugins');
    if (fs.existsSync(localPluginsPath)) {
        const pluginDirs = await fs.promises.readdir(localPluginsPath, { withFileTypes: true });

        for (const entry of pluginDirs) {
            if (entry.isDirectory()) {
                const pluginPath = path.join(localPluginsPath, entry.name);
                const actions = await discoverPluginActions(
                    pluginPath,
                    projectRoot,
                    registry,
                    verbose,
                    viteServer,
                );
                allActions.push(...actions);
            }
        }
    }

    // Discover npm package plugins
    const npmActions = await discoverNpmPluginActions(projectRoot, registry, verbose, viteServer);
    allActions.push(...npmActions);

    return allActions;
}

/**
 * Discovers actions from npm package plugins.
 *
 * Scans project's package.json for dependencies that have a plugin.yaml export.
 */
async function discoverNpmPluginActions(
    projectRoot: string,
    registry: ActionRegistry,
    verbose: boolean,
    viteServer?: ViteSSRLoader,
): Promise<string[]> {
    const allActions: string[] = [];
    const packageJsonPath = path.join(projectRoot, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        return allActions;
    }

    try {
        const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8'));
        const dependencies = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
        };

        for (const packageName of Object.keys(dependencies)) {
            try {
                // Try to resolve the package's plugin.yaml
                const pluginYamlPath = tryResolvePluginYaml(packageName, projectRoot);
                if (!pluginYamlPath) {
                    continue;
                }

                // Load the plugin manifest
                const pluginDir = path.dirname(pluginYamlPath);
                const pluginConfig = loadPluginManifest(pluginDir);

                if (
                    !pluginConfig ||
                    !pluginConfig.actions ||
                    !Array.isArray(pluginConfig.actions)
                ) {
                    continue;
                }

                if (verbose) {
                    getLogger().info(
                        `[Actions] NPM plugin "${packageName}" declares actions: ${JSON.stringify(pluginConfig.actions)}`,
                    );
                }

                // Import the package's main module
                const actions = await registerNpmPluginActions(
                    packageName,
                    pluginConfig,
                    pluginDir,
                    registry,
                    verbose,
                    viteServer,
                );
                allActions.push(...actions);
            } catch {
                // Package doesn't have plugin.yaml or other resolution error - skip
                continue;
            }
        }
    } catch (error) {
        getLogger().error(`[Actions] Failed to read project package.json: ${error}`);
    }

    return allActions;
}

/**
 * Tries to resolve the plugin.yaml path for an npm package.
 * Returns the path if found, null otherwise.
 */
function tryResolvePluginYaml(packageName: string, projectRoot: string): string | null {
    try {
        // First try the package's plugin.yaml export
        return require.resolve(`${packageName}/plugin.yaml`, {
            paths: [projectRoot],
        });
    } catch {
        // Not all packages have plugin.yaml
        return null;
    }
}

/**
 * Resolves a .jay-action file path for an NPM package.
 *
 * For NPM packages, action paths are export subpaths (e.g. "send-message.jay-action")
 * resolved via require.resolve (like contracts). Falls back to path.resolve from pluginDir
 * for backward compatibility with relative paths.
 */
function resolveNpmActionMetadataPath(
    actionPath: string,
    packageName: string,
    pluginDir: string,
): string | null {
    // First try as a package export subpath (e.g. "packageName/send-message.jay-action")
    if (!actionPath.startsWith('.')) {
        try {
            return require.resolve(`${packageName}/${actionPath}`, {
                paths: [pluginDir],
            });
        } catch {
            // Fall through to relative resolution
        }
    }

    // Fall back to relative resolution from plugin dir
    const resolved = resolveActionMetadataPath(actionPath, pluginDir);
    if (fs.existsSync(resolved)) {
        return resolved;
    }

    getLogger().warn(
        `[Actions] Could not resolve .jay-action file "${actionPath}" for package "${packageName}"`,
    );
    return null;
}

/**
 * Registers actions from an npm package plugin.
 */
async function registerNpmPluginActions(
    packageName: string,
    pluginConfig: PluginManifest,
    pluginDir: string,
    registry: ActionRegistry,
    verbose: boolean,
    viteServer?: ViteSSRLoader,
): Promise<string[]> {
    const registeredActions: string[] = [];

    try {
        // Import the package's main module
        let pluginModule: Record<string, any>;
        if (viteServer) {
            pluginModule = await viteServer.ssrLoadModule(packageName);
        } else {
            pluginModule = await import(packageName);
        }

        // Register each declared action
        for (const entry of pluginConfig.actions!) {
            const { name: actionName, action: actionPath } = normalizeActionEntry(entry);
            const actionExport = pluginModule[actionName];

            if (actionExport && isJayAction(actionExport)) {
                registry.register(actionExport as any);
                const registeredName = (actionExport as any).actionName;
                registeredActions.push(registeredName);

                // Load .jay-action metadata if a file path is specified
                if (actionPath) {
                    const metadataFilePath = resolveNpmActionMetadataPath(
                        actionPath,
                        packageName,
                        pluginDir,
                    );
                    if (metadataFilePath) {
                        const metadata = loadActionMetadata(metadataFilePath);
                        if (metadata) {
                            registry.setMetadata(registeredName, metadata);
                            if (verbose) {
                                getLogger().info(
                                    `[Actions] Loaded metadata for "${registeredName}" from ${actionPath}`,
                                );
                            }
                        }
                    }
                }

                if (verbose) {
                    getLogger().info(`[Actions] Registered NPM plugin action: ${registeredName}`);
                }
            } else {
                getLogger().warn(
                    `[Actions] NPM plugin "${packageName}" declares action "${actionName}" but it's not exported or not a JayAction`,
                );
            }
        }
    } catch (importError) {
        getLogger().error(`[Actions] Failed to import NPM plugin "${packageName}": ${importError}`);
    }

    return registeredActions;
}

/**
 * Discovers actions from a single plugin's plugin.yaml file.
 *
 * Reads plugin.yaml, finds the `actions` array, and imports those
 * named exports from the plugin's module.
 *
 * @param pluginPath - Path to the plugin directory (containing plugin.yaml)
 * @param projectRoot - Project root for resolving imports
 * @param registry - Registry to register actions in
 * @param verbose - Whether to log progress
 * @returns Array of registered action names
 */
export async function discoverPluginActions(
    pluginPath: string,
    projectRoot: string,
    registry: ActionRegistry = actionRegistry,
    verbose: boolean = false,
    viteServer?: ViteSSRLoader,
): Promise<string[]> {
    // Use shared plugin manifest loader
    const pluginConfig = loadPluginManifest(pluginPath);

    if (!pluginConfig) {
        return [];
    }

    if (!pluginConfig.actions || !Array.isArray(pluginConfig.actions)) {
        return [];
    }

    const registeredActions: string[] = [];
    const pluginName = pluginConfig.name || path.basename(pluginPath);

    if (verbose) {
        getLogger().info(
            `[Actions] Plugin "${pluginName}" declares actions: ${JSON.stringify(pluginConfig.actions)}`,
        );
    }

    // Determine the module path to import
    // For local plugins: use the module field or default to index.ts
    let modulePath = pluginConfig.module
        ? path.join(pluginPath, pluginConfig.module)
        : path.join(pluginPath, 'index.ts');

    // Handle module paths without extension - try .ts and .js
    if (!fs.existsSync(modulePath)) {
        const tsPath = modulePath + '.ts';
        const jsPath = modulePath + '.js';
        if (fs.existsSync(tsPath)) {
            modulePath = tsPath;
        } else if (fs.existsSync(jsPath)) {
            modulePath = jsPath;
        } else {
            getLogger().warn(`[Actions] Plugin "${pluginName}" module not found at ${modulePath}`);
            return [];
        }
    }

    try {
        // Import the plugin module
        // Use Vite's SSR loader for TypeScript files in dev mode
        let pluginModule: Record<string, any>;
        if (viteServer) {
            pluginModule = await viteServer.ssrLoadModule(modulePath);
        } else {
            // Production fallback: requires pre-compiled .js files
            pluginModule = await import(modulePath);
        }

        // Register each declared action
        for (const entry of pluginConfig.actions) {
            const { name: actionName, action: actionPath } = normalizeActionEntry(entry);
            const actionExport = pluginModule[actionName];

            if (actionExport && isJayAction(actionExport)) {
                registry.register(actionExport as any);
                const registeredName = (actionExport as any).actionName;
                registeredActions.push(registeredName);

                // Load .jay-action metadata if a file path is specified
                if (actionPath) {
                    const metadataFilePath = resolveActionMetadataPath(actionPath, pluginPath);
                    const metadata = loadActionMetadata(metadataFilePath);
                    if (metadata) {
                        registry.setMetadata(registeredName, metadata);
                        if (verbose) {
                            getLogger().info(
                                `[Actions] Loaded metadata for "${registeredName}" from ${actionPath}`,
                            );
                        }
                    }
                }

                if (verbose) {
                    getLogger().info(`[Actions] Registered plugin action: ${registeredName}`);
                }
            } else {
                getLogger().warn(
                    `[Actions] Plugin "${pluginName}" declares action "${actionName}" but it's not exported or not a JayAction`,
                );
            }
        }
    } catch (importError) {
        getLogger().error(
            `[Actions] Failed to import plugin module at ${modulePath}: ${importError}`,
        );
    }

    return registeredActions;
}
