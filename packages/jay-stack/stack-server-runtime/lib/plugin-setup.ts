/**
 * Plugin Setup and References (Design Log #87)
 *
 * Two separate concerns:
 *   - **Setup** (jay-stack setup): Config creation + credential/service validation
 *   - **References** (jay-stack agent-kit): Generate discovery data using live services
 *
 * Setup flow:
 *   1. Scan plugins for `setup.handler` in plugin.yaml
 *   2. Run init for all plugins (dependency-ordered)
 *   3. For each target plugin: load setup handler → call it → report result
 *
 * References flow (called by agent-kit after materializing contracts):
 *   1. Scan plugins for `setup.references` in plugin.yaml
 *   2. Services are already initialized (agent-kit does this for contract materialization)
 *   3. For each plugin: load references handler → call it → report result
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanPlugins, type ScannedPlugin } from './plugin-scanner';
import { getServiceRegistry } from './services';
import type { ViteSSRLoader } from './action-discovery';
import { getLogger } from '@jay-framework/logger';

// ============================================================================
// Setup Types (jay-stack setup)
// ============================================================================

/**
 * Context passed to a plugin's setup handler.
 * Setup handles config creation and service validation only.
 */
export interface PluginSetupContext {
    /** Plugin name (from plugin.yaml) */
    pluginName: string;
    /** Project root directory */
    projectRoot: string;
    /** Config directory path (from .jay configBase, defaults to ./config) */
    configDir: string;
    /** Registered services (may be empty if init failed) */
    services: Map<symbol, unknown>;
    /** Present if plugin init failed */
    initError?: Error;
    /** Whether --force flag was passed */
    force: boolean;
}

/**
 * Result returned by a plugin's setup handler.
 */
export interface PluginSetupResult {
    /** Overall status */
    status: 'configured' | 'needs-config' | 'error';
    /** Config files created (relative to project root) */
    configCreated?: string[];
    /** Human-readable status message */
    message?: string;
}

/** A plugin's setup handler function signature. */
export type PluginSetupHandler = (context: PluginSetupContext) => Promise<PluginSetupResult>;

// ============================================================================
// References Types (jay-stack agent-kit)
// ============================================================================

/**
 * Context passed to a plugin's references handler.
 * Services may or may not be initialized — check initError if your handler needs them.
 */
export interface PluginReferencesContext {
    /** Plugin name (from plugin.yaml) */
    pluginName: string;
    /** Project root directory */
    projectRoot: string;
    /** Directory for this plugin's reference data (agent-kit/references/<plugin>/) */
    referencesDir: string;
    /** Registered services */
    services: Map<symbol, unknown>;
    /** Present if this plugin's server init failed */
    initError?: Error;
    /** Whether --force flag was passed */
    force: boolean;
}

/**
 * Result returned by a plugin's references handler.
 */
export interface PluginReferencesResult {
    /** Reference files created (relative to project root) */
    referencesCreated: string[];
    /** Human-readable status message */
    message?: string;
}

/** A plugin's references handler function signature. */
export type PluginReferencesHandler = (
    context: PluginReferencesContext,
) => Promise<PluginReferencesResult>;

// ============================================================================
// Shared plugin info
// ============================================================================

/**
 * Information about a discovered plugin with a setup handler.
 */
export interface PluginWithSetup {
    /** Plugin name from plugin.yaml */
    name: string;
    /** Plugin path (directory containing plugin.yaml) */
    pluginPath: string;
    /** Package name for NPM plugins, or path for local plugins */
    packageName: string;
    /** Whether this is a local plugin */
    isLocal: boolean;
    /** Setup handler export name or relative path */
    setupHandler: string;
    /** Setup description from plugin.yaml */
    setupDescription?: string;
    /** Dependencies from package.json (for ordering) */
    dependencies: string[];
}

/**
 * Information about a discovered plugin with a references handler.
 */
export interface PluginWithReferences {
    /** Plugin name from plugin.yaml */
    name: string;
    /** Plugin path (directory containing plugin.yaml) */
    pluginPath: string;
    /** Package name for NPM plugins, or path for local plugins */
    packageName: string;
    /** Whether this is a local plugin */
    isLocal: boolean;
    /** References handler export name */
    referencesHandler: string;
    /** Dependencies from package.json (for ordering) */
    dependencies: string[];
}

// ============================================================================
// Discovery
// ============================================================================

/**
 * Discovers all plugins that have a `setup.handler` in plugin.yaml.
 */
export async function discoverPluginsWithSetup(options: {
    projectRoot: string;
    verbose?: boolean;
    pluginFilter?: string;
}): Promise<PluginWithSetup[]> {
    const { projectRoot, verbose, pluginFilter } = options;

    const allPlugins = await scanPlugins({
        projectRoot,
        verbose,
        discoverTransitive: true,
    });

    const pluginsWithSetup: PluginWithSetup[] = [];

    for (const [packageName, plugin] of allPlugins) {
        if (!plugin.manifest.setup?.handler) continue;

        // Filter to specific plugin if requested
        if (pluginFilter && plugin.name !== pluginFilter && packageName !== pluginFilter) {
            continue;
        }

        pluginsWithSetup.push({
            name: plugin.name,
            pluginPath: plugin.pluginPath,
            packageName: plugin.packageName,
            isLocal: plugin.isLocal,
            setupHandler: plugin.manifest.setup.handler,
            setupDescription: plugin.manifest.setup.description,
            dependencies: plugin.dependencies,
        });

        if (verbose) {
            getLogger().info(`[Setup] Found plugin with setup: ${plugin.name}`);
        }
    }

    // Sort by dependencies (plugins with no deps first)
    return sortByDependencies(pluginsWithSetup);
}

/**
 * Discovers all plugins that have a `setup.references` in plugin.yaml.
 */
export async function discoverPluginsWithReferences(options: {
    projectRoot: string;
    verbose?: boolean;
    pluginFilter?: string;
}): Promise<PluginWithReferences[]> {
    const { projectRoot, verbose, pluginFilter } = options;

    const allPlugins = await scanPlugins({
        projectRoot,
        verbose,
        discoverTransitive: true,
    });

    const pluginsWithRefs: PluginWithReferences[] = [];

    for (const [packageName, plugin] of allPlugins) {
        if (!plugin.manifest.setup?.references) continue;

        if (pluginFilter && plugin.name !== pluginFilter && packageName !== pluginFilter) {
            continue;
        }

        pluginsWithRefs.push({
            name: plugin.name,
            pluginPath: plugin.pluginPath,
            packageName: plugin.packageName,
            isLocal: plugin.isLocal,
            referencesHandler: plugin.manifest.setup.references,
            dependencies: plugin.dependencies,
        });

        if (verbose) {
            getLogger().info(`[AgentKit] Found plugin with references: ${plugin.name}`);
        }
    }

    return sortByDependencies(pluginsWithRefs);
}

/**
 * Simple topological sort by dependencies.
 * Plugins whose dependencies appear earlier in the list run first.
 */
function sortByDependencies<
    T extends { name: string; packageName: string; dependencies: string[] },
>(plugins: T[]): T[] {
    return [...plugins].sort((a, b) => {
        const aDepsOnB = a.dependencies.some((d) => d === b.name || d === b.packageName) ? 1 : 0;
        const bDepsOnA = b.dependencies.some((d) => d === a.name || d === a.packageName) ? 1 : 0;
        return aDepsOnB - bDepsOnA;
    });
}

// ============================================================================
// Setup Execution (jay-stack setup)
// ============================================================================

/**
 * Loads and executes a plugin's setup handler.
 */
export async function executePluginSetup(
    plugin: PluginWithSetup,
    options: {
        projectRoot: string;
        configDir: string;
        force: boolean;
        initError?: Error;
        viteServer?: ViteSSRLoader;
        verbose?: boolean;
    },
): Promise<PluginSetupResult> {
    const { projectRoot, configDir, force, initError, viteServer, verbose } = options;

    const context: PluginSetupContext = {
        pluginName: plugin.name,
        projectRoot,
        configDir,
        services: getServiceRegistry(),
        initError,
        force,
    };

    // Load the setup handler module
    const handler = await loadHandler<PluginSetupHandler>(plugin, plugin.setupHandler, viteServer);

    // Execute
    return handler(context);
}

// ============================================================================
// References Execution (jay-stack agent-kit)
// ============================================================================

/**
 * Loads and executes a plugin's references handler.
 */
export async function executePluginReferences(
    plugin: PluginWithReferences,
    options: {
        projectRoot: string;
        force: boolean;
        initError?: Error;
        viteServer?: ViteSSRLoader;
        verbose?: boolean;
    },
): Promise<PluginReferencesResult> {
    const { projectRoot, force, initError, viteServer } = options;

    const referencesDir = path.join(projectRoot, 'agent-kit', 'references', plugin.name);

    const context: PluginReferencesContext = {
        pluginName: plugin.name,
        projectRoot,
        referencesDir,
        services: getServiceRegistry(),
        initError,
        force,
    };

    const handler = await loadHandler<PluginReferencesHandler>(
        plugin,
        plugin.referencesHandler,
        viteServer,
    );

    return handler(context);
}

// ============================================================================
// Shared handler loading
// ============================================================================

/**
 * Loads a named export from a plugin's package.
 */
async function loadHandler<T extends (...args: any[]) => any>(
    plugin: { isLocal: boolean; pluginPath: string; packageName: string },
    handlerName: string,
    viteServer?: ViteSSRLoader,
): Promise<T> {
    let module: any;

    if (plugin.isLocal) {
        // Local plugin: handler name is a relative path to the module
        const handlerPath = path.resolve(plugin.pluginPath, handlerName);
        if (viteServer) {
            module = await viteServer.ssrLoadModule(handlerPath);
        } else {
            module = await import(handlerPath);
        }

        // For local plugins, try common export names
        if (typeof module[handlerName] === 'function') return module[handlerName];
        if (typeof module.setup === 'function') return module.setup;
        if (typeof module.default === 'function') return module.default;

        throw new Error(
            `Handler "${handlerName}" not found in "${plugin.pluginPath}". ` +
                `Available exports: ${Object.keys(module).join(', ')}`,
        );
    } else {
        // NPM plugin: handler is an export name from the package main module
        if (viteServer) {
            module = await viteServer.ssrLoadModule(plugin.packageName);
        } else {
            module = await import(plugin.packageName);
        }

        if (typeof module[handlerName] !== 'function') {
            throw new Error(
                `Handler "${handlerName}" not found as export in "${plugin.packageName}". ` +
                    `Available exports: ${Object.keys(module).join(', ')}`,
            );
        }

        return module[handlerName] as T;
    }
}
