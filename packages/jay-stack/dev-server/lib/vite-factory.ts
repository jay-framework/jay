/**
 * Vite Factory
 *
 * Creates a minimal Vite server for CLI tools that need TypeScript support.
 * This allows CLI commands to load TypeScript files (like dynamic contract generators)
 * without requiring a full dev-server.
 */

import { createServer, ViteDevServer } from 'vite';
import { jayStackCompiler } from '@jay-framework/compiler-jay-stack';
import path from 'node:path';

export interface CreateViteForCliOptions {
    /** Project root directory */
    projectRoot: string;
    /** Path to tsconfig.json (defaults to projectRoot/tsconfig.json) */
    tsConfigFilePath?: string;
}

/**
 * Creates a minimal Vite server for CLI usage.
 *
 * This provides TypeScript transpilation via Vite's SSR loader,
 * allowing CLI commands to dynamically import .ts files.
 *
 * @example
 * ```ts
 * const vite = await createViteForCli({ projectRoot: process.cwd() });
 * try {
 *   const module = await vite.ssrLoadModule('/path/to/file.ts');
 *   // use module...
 * } finally {
 *   await vite.close();
 * }
 * ```
 */
export async function createViteForCli(options: CreateViteForCliOptions): Promise<ViteDevServer> {
    const { projectRoot, tsConfigFilePath = path.join(projectRoot, 'tsconfig.json') } = options;

    const vite = await createServer({
        // Don't start HTTP server
        server: { middlewareMode: true },
        // Use Jay Stack compiler for .jay-html and other custom transforms
        plugins: [...jayStackCompiler({ tsConfigFilePath })],
        // Custom app type (no default middleware)
        appType: 'custom',
        // Root directory for module resolution
        root: projectRoot,
        // SSR configuration
        ssr: {
            // Mark stack-server-runtime as external so Vite uses Node's require
            // This ensures consistent module instances
            external: ['@jay-framework/stack-server-runtime'],
        },
        // Suppress Vite's console output in CLI mode
        logLevel: 'warn',
        // Don't clear screen
        clearScreen: false,
    });

    return vite;
}
