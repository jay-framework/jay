/**
 * Vite Factory
 *
 * Single source of truth for creating Vite servers.
 * Used by both the dev-server and CLI commands.
 */

import { createServer, ViteDevServer } from 'vite';
import { jayStackCompiler, JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import path from 'node:path';

export interface CreateViteServerOptions {
    /** Project root directory */
    projectRoot: string;
    /** Root directory for pages (defaults to projectRoot) */
    pagesRoot?: string;
    /** Base URL path for public assets */
    base?: string;
    /** Jay Stack compiler config (optional, will use defaults if not provided) */
    jayRollupConfig?: JayRollupConfig;
    /** Log level (defaults to 'info' for dev-server, 'warn' for CLI) */
    logLevel?: 'info' | 'warn' | 'error' | 'silent';
    /** Whether to clear screen on rebuild */
    clearScreen?: boolean;
}

/**
 * Creates a Vite server configured for Jay Stack.
 *
 * This is the single source of truth for Vite configuration.
 * Both dev-server and CLI use this function.
 */
export async function createViteServer(options: CreateViteServerOptions): Promise<ViteDevServer> {
    const {
        projectRoot,
        pagesRoot = projectRoot,
        base,
        jayRollupConfig = { tsConfigFilePath: path.join(projectRoot, 'tsconfig.json') },
        logLevel = 'info',
        clearScreen = true,
    } = options;

    const vite = await createServer({
        // Don't start HTTP server - we use middleware mode
        server: { middlewareMode: true },
        // Use Jay Stack compiler for .jay-html and other custom transforms
        plugins: [...jayStackCompiler(jayRollupConfig)],
        // Custom app type (no default middleware)
        appType: 'custom',
        // Base URL path
        base,
        // Root directory for module resolution
        root: pagesRoot,
        // SSR configuration
        ssr: {
            // Mark jay-framework packages as external so Vite uses Node's require
            // This ensures all packages share the same module instances (Symbol identity)
            external: [
                '@jay-framework/stack-server-runtime',
                '@jay-framework/fullstack-component',
            ],
        },
        // Logging
        logLevel,
        clearScreen,
    });

    return vite;
}

/**
 * Creates a minimal Vite server for CLI usage.
 *
 * This is a convenience wrapper around createViteServer with CLI-appropriate defaults.
 */
export async function createViteForCli(options: {
    projectRoot: string;
    tsConfigFilePath?: string;
}): Promise<ViteDevServer> {
    const { projectRoot, tsConfigFilePath = path.join(projectRoot, 'tsconfig.json') } = options;

    return createViteServer({
        projectRoot,
        jayRollupConfig: { tsConfigFilePath },
        logLevel: 'warn',
        clearScreen: false,
    });
}
