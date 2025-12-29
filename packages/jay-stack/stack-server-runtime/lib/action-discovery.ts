/**
 * Action discovery and auto-registration for Jay Stack.
 *
 * Scans project and plugin directories to discover and register actions
 * automatically on server startup.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ActionRegistry, actionRegistry } from './action-registry';
import { isJayAction } from '@jay-framework/fullstack-component';
import { loadPluginManifest } from '@jay-framework/compiler-shared';

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
            console.log(`[Actions] No actions directory found at ${actionsPath}`);
        }
        return result;
    }

    // Find all .actions.ts files
    const actionFiles = await findActionFiles(actionsPath);

    if (verbose) {
        console.log(`[Actions] Found ${actionFiles.length} action file(s)`);
    }

    // Import and register each action file
    for (const filePath of actionFiles) {
        result.scannedFiles.push(filePath);

        try {
            // Dynamic import of the action module
            const module = await import(filePath);

            // Find and register all JayAction exports
            for (const [exportName, exportValue] of Object.entries(module)) {
                if (isJayAction(exportValue)) {
                    registry.register(exportValue as any);
                    result.actionNames.push((exportValue as any).actionName);
                    result.actionCount++;

                    if (verbose) {
                        console.log(`[Actions] Registered: ${(exportValue as any).actionName}`);
                    }
                }
            }
        } catch (error) {
            console.error(`[Actions] Failed to import ${filePath}:`, error);
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
    const { projectRoot, registry = actionRegistry, verbose = false } = options;
    const allActions: string[] = [];

    // Discover local plugins in src/plugins/
    const localPluginsPath = path.join(projectRoot, 'src/plugins');
    if (fs.existsSync(localPluginsPath)) {
        const pluginDirs = await fs.promises.readdir(localPluginsPath, { withFileTypes: true });

        for (const entry of pluginDirs) {
            if (entry.isDirectory()) {
                const pluginPath = path.join(localPluginsPath, entry.name);
                const actions = await discoverPluginActions(pluginPath, projectRoot, registry, verbose);
                allActions.push(...actions);
            }
        }
    }

    return allActions;
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
        console.log(`[Actions] Plugin "${pluginName}" declares actions:`, pluginConfig.actions);
    }

    // Determine the module path to import
    // For local plugins: use the module field or default to index.ts
    const modulePath = pluginConfig.module
        ? path.join(pluginPath, pluginConfig.module)
        : path.join(pluginPath, 'index.ts');

    if (!fs.existsSync(modulePath) && !fs.existsSync(modulePath.replace('.ts', '.js'))) {
        console.warn(`[Actions] Plugin "${pluginName}" module not found at ${modulePath}`);
        return [];
    }

    try {
        // Import the plugin module
        const pluginModule = await import(modulePath);

        // Register each declared action
        for (const actionName of pluginConfig.actions) {
            const actionExport = pluginModule[actionName];

            if (actionExport && isJayAction(actionExport)) {
                registry.register(actionExport as any);
                registeredActions.push((actionExport as any).actionName);

                if (verbose) {
                    console.log(`[Actions] Registered plugin action: ${(actionExport as any).actionName}`);
                }
            } else {
                console.warn(
                    `[Actions] Plugin "${pluginName}" declares action "${actionName}" but it's not exported or not a JayAction`,
                );
            }
        }
    } catch (importError) {
        console.error(`[Actions] Failed to import plugin module at ${modulePath}:`, importError);
    }

    return registeredActions;
}


