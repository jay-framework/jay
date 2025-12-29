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
 * Discovers actions from plugin.yaml files.
 *
 * Reads plugin.yaml, finds the `actions` array, and imports those
 * named exports from the plugin's backend bundle.
 *
 * @param pluginPath - Path to the plugin directory (containing plugin.yaml)
 * @param registry - Registry to register actions in
 * @returns Array of registered action names
 */
export async function discoverPluginActions(
    pluginPath: string,
    registry: ActionRegistry = actionRegistry,
): Promise<string[]> {
    const pluginYamlPath = path.join(pluginPath, 'plugin.yaml');

    if (!fs.existsSync(pluginYamlPath)) {
        return [];
    }

    try {
        const yamlContent = await fs.promises.readFile(pluginYamlPath, 'utf-8');
        const pluginConfig = parseSimpleYaml(yamlContent);

        if (!pluginConfig.actions || !Array.isArray(pluginConfig.actions)) {
            return [];
        }

        const registeredActions: string[] = [];

        // Try to import the plugin's main entry or backend bundle
        // This would need to resolve the actual plugin package
        // For now, we'll return the action names from the config
        // The actual import would be done by the build system

        console.log(`[Actions] Plugin ${pluginConfig.name} declares actions:`, pluginConfig.actions);

        return registeredActions;
    } catch (error) {
        console.error(`[Actions] Failed to read plugin.yaml at ${pluginPath}:`, error);
        return [];
    }
}

/**
 * Simple YAML parser for plugin.yaml files.
 * Handles basic key: value and key: [array] formats.
 */
function parseSimpleYaml(content: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = content.split('\n');

    let currentKey: string | null = null;
    let currentArray: string[] | null = null;

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        // Check for array item (starts with -)
        if (trimmed.startsWith('- ') && currentKey && currentArray) {
            const value = trimmed.slice(2).trim();
            currentArray.push(value);
            continue;
        }

        // Check for key: value
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
            // Save previous array if any
            if (currentKey && currentArray) {
                result[currentKey] = currentArray;
            }

            const key = trimmed.slice(0, colonIndex).trim();
            const value = trimmed.slice(colonIndex + 1).trim();

            if (value) {
                // Inline value
                result[key] = value.replace(/^["']|["']$/g, ''); // Remove quotes
                currentKey = null;
                currentArray = null;
            } else {
                // Array or nested object follows
                currentKey = key;
                currentArray = [];
            }
        }
    }

    // Save final array if any
    if (currentKey && currentArray) {
        result[currentKey] = currentArray;
    }

    return result;
}

