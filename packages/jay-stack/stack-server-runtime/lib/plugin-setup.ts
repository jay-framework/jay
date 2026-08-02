/**
 * Plugin Setup and Agent-Kit (Design Log #87)
 *
 * Two separate concerns:
 *   - **Setup** (jay-stack setup): Config creation + credential/service validation
 *   - **Agent-kit** (jay-stack agent-kit): Generate discovery data using live services
 *
 * Setup flow:
 *   1. Scan plugins for `setup` in plugin.yaml
 *   2. Run init for all plugins (dependency-ordered)
 *   3. For each target plugin: load setup handler → call it → report result
 *
 * Agent-kit flow (called by agent-kit after materializing contracts):
 *   1. Scan plugins for `agentkit` in plugin.yaml
 *   2. Services are already initialized (agent-kit does this for contract materialization)
 *   3. For each plugin: load agent-kit handler → call it → report result
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
 * Thrown by non-interactive prompt when an answer is missing.
 * The CLI catches this and prints structured output for agents.
 */
export class SetupNeedsAnswerError extends Error {
    constructor(
        public readonly plugin: string,
        public readonly key: string,
        public readonly type: 'input' | 'confirm' | 'select',
        public readonly promptMessage: string,
        public readonly choices?: Array<{ name: string; value: string }>,
    ) {
        super(`Setup needs answer for "${key}": ${promptMessage}`);
        this.name = 'SetupNeedsAnswerError';
    }
}

/**
 * Prompt functions available to setup handlers.
 * Each prompt requires a stable `key` for answer matching across re-runs.
 */
export interface PluginSetupPrompt {
    input(options: {
        key: string;
        message: string;
        validate?: (v: string) => boolean | string;
    }): Promise<string>;
    confirm(options: { key: string; message: string; default?: boolean }): Promise<boolean>;
    select(options: {
        key: string;
        message: string;
        choices: Array<{ name: string; value: string }>;
    }): Promise<string>;
}

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
    /** Whether running in interactive mode (can prompt user) */
    interactive: boolean;
    /** Prompt functions for interactive user input */
    prompt: PluginSetupPrompt;
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
// Agent-kit Types (jay-stack agent-kit)
// ============================================================================

/**
 * Context passed to a plugin's agent-kit handler.
 * Services may or may not be initialized — check initError if your handler needs them.
 */
export interface PluginAgentKitContext {
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
 * Result returned by a plugin's agent-kit handler.
 */
export interface PluginAgentKitResult {
    /** Agent-kit output files created (relative to project root) */
    agentKitCreated: string[];
    /** Human-readable status message */
    message?: string;
}

/** A plugin's agent-kit handler function signature. */
export type PluginAgentKitHandler = (
    context: PluginAgentKitContext,
) => Promise<PluginAgentKitResult>;

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
 * Information about a discovered plugin with an agent-kit handler.
 */
export interface PluginWithAgentKit {
    /** Plugin name from plugin.yaml */
    name: string;
    /** Plugin path (directory containing plugin.yaml) */
    pluginPath: string;
    /** Package name for NPM plugins, or path for local plugins */
    packageName: string;
    /** Whether this is a local plugin */
    isLocal: boolean;
    /** Agent-kit handler export name */
    agentKitHandler: string;
    /** Dependencies from package.json (for ordering) */
    dependencies: string[];
}

// ============================================================================
// Discovery
// ============================================================================

/**
 * Discovers all plugins that have a `setup` handler in plugin.yaml.
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
        includeDevDeps: true,
        discoverTransitive: true,
    });

    const pluginsWithSetup: PluginWithSetup[] = [];

    for (const [packageName, plugin] of allPlugins) {
        if (!plugin.manifest.setup) continue;

        // Filter to specific plugin if requested
        if (pluginFilter && plugin.name !== pluginFilter && packageName !== pluginFilter) {
            continue;
        }

        pluginsWithSetup.push({
            name: plugin.name,
            pluginPath: plugin.pluginPath,
            packageName: plugin.packageName,
            isLocal: plugin.isLocal,
            setupHandler: plugin.manifest.setup,
            setupDescription: plugin.manifest.description,
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
 * Discovers all plugins that have an `agentkit` handler in plugin.yaml.
 */
export async function discoverPluginsWithAgentKit(options: {
    projectRoot: string;
    verbose?: boolean;
    pluginFilter?: string;
}): Promise<PluginWithAgentKit[]> {
    const { projectRoot, verbose, pluginFilter } = options;

    const allPlugins = await scanPlugins({
        projectRoot,
        verbose,
        includeDevDeps: true,
        discoverTransitive: true,
    });

    const pluginsWithAgentKit: PluginWithAgentKit[] = [];

    for (const [packageName, plugin] of allPlugins) {
        if (!plugin.manifest.agentkit) continue;

        if (pluginFilter && plugin.name !== pluginFilter && packageName !== pluginFilter) {
            continue;
        }

        pluginsWithAgentKit.push({
            name: plugin.name,
            pluginPath: plugin.pluginPath,
            packageName: plugin.packageName,
            isLocal: plugin.isLocal,
            agentKitHandler: plugin.manifest.agentkit,
            dependencies: plugin.dependencies,
        });

        if (verbose) {
            getLogger().info(`[AgentKit] Found plugin with agent-kit handler: ${plugin.name}`);
        }
    }

    return sortByDependencies(pluginsWithAgentKit);
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
        interactive: boolean;
        prompt: PluginSetupPrompt;
        initError?: Error;
        viteServer?: ViteSSRLoader;
        verbose?: boolean;
    },
): Promise<PluginSetupResult> {
    const { projectRoot, configDir, force, interactive, prompt, initError, viteServer } = options;

    const context: PluginSetupContext = {
        pluginName: plugin.name,
        projectRoot,
        configDir,
        services: getServiceRegistry(),
        initError,
        force,
        interactive,
        prompt,
    };

    // Load the setup handler module
    const handler = await loadHandler<PluginSetupHandler>(plugin, plugin.setupHandler, viteServer);

    // Execute
    return handler(context);
}

// ============================================================================
// Agent-kit Execution (jay-stack agent-kit)
// ============================================================================

/**
 * Loads and executes a plugin's agent-kit handler.
 */
export async function executePluginAgentKit(
    plugin: PluginWithAgentKit,
    options: {
        projectRoot: string;
        force: boolean;
        initError?: Error;
        viteServer?: ViteSSRLoader;
        verbose?: boolean;
    },
): Promise<PluginAgentKitResult> {
    const { projectRoot, force, initError, viteServer } = options;

    const referencesDir = path.join(projectRoot, 'agent-kit', 'references', plugin.name);

    const context: PluginAgentKitContext = {
        pluginName: plugin.name,
        projectRoot,
        referencesDir,
        services: getServiceRegistry(),
        initError,
        force,
    };

    const handler = await loadHandler<PluginAgentKitHandler>(
        plugin,
        plugin.agentKitHandler,
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
        if (typeof module.agentkit === 'function') return module.agentkit;
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
