/**
 * Plugin-facing contract types for setup and agent-kit handlers (Design Log #87, #178).
 *
 * These are pure type declarations describing the contract between plugins and the
 * framework's build tooling. They live in `stack-server-runtime` (compiler-free) so
 * that plugin packages — which are runtime artifacts and must NOT depend on build
 * packages — can import them without pulling in compiler/vite dependencies.
 *
 * The build-time discovery/execution logic (`discoverPluginsWithSetup`,
 * `executePluginAgentKit`, etc.) lives in `stack-server-build`.
 */

// ============================================================================
// Setup Types (jay-stack setup)
// ============================================================================

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
