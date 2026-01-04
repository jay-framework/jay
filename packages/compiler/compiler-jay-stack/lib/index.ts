import { Plugin } from 'vite';
import { jayRuntime, JayRollupConfig } from '@jay-framework/vite-plugin';
import { transformJayStackBuilder, BuildEnvironment } from './transform-jay-stack-builder';
import {
    transformActionImports,
    isActionImport,
    extractActionsFromSource,
    clearActionMetadataCache,
} from './transform-action-imports';
import { createImportChainTracker, ImportChainTrackerOptions } from './import-chain-tracker';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type { BuildEnvironment } from './transform-jay-stack-builder';
export { transformJayStackBuilder } from './transform-jay-stack-builder';
export type { JayRollupConfig } from '@jay-framework/vite-plugin';
export {
    transformActionImports,
    isActionImport,
    extractActionsFromSource,
    clearActionMetadataCache,
    type ActionMetadata,
    type ExtractedActions,
} from './transform-action-imports';
export { createImportChainTracker, type ImportChainTrackerOptions } from './import-chain-tracker';

export interface JayStackCompilerOptions extends JayRollupConfig {
    /**
     * Enable import chain tracking for debugging server code leaking into client builds.
     * When enabled, logs the full import chain when server-only modules are detected.
     * @default false (but auto-enabled when DEBUG_IMPORTS=1 env var is set)
     */
    trackImports?: boolean | ImportChainTrackerOptions;
}

/**
 * Jay Stack Compiler - Handles both Jay runtime compilation and Jay Stack code splitting
 *
 * This plugin internally uses the jay:runtime plugin and adds Jay Stack-specific
 * transformations for client/server code splitting.
 *
 * Environment detection is based on Vite's `options.ssr`:
 * - `options.ssr = true` → server build (strip client code)
 * - `options.ssr = false/undefined` → client build (strip server code)
 *
 * This works for both:
 * - Dev server: SSR renders with server code, browser hydrates with client code
 * - Package builds: Use `build.ssr = true/false` to control environment
 *
 * Usage:
 * ```typescript
 * import { jayStackCompiler } from '@jay-framework/compiler-jay-stack';
 *
 * export default defineConfig({
 *   plugins: [
 *     ...jayStackCompiler({ tsConfigFilePath: './tsconfig.json' })
 *   ]
 * });
 * ```
 *
 * To debug import chain issues (server code leaking to client):
 * ```bash
 * DEBUG_IMPORTS=1 npm run build
 * ```
 *
 * Or enable in config:
 * ```typescript
 * ...jayStackCompiler({ trackImports: true })
 * ```
 *
 * @param options - Configuration for Jay Stack compiler
 * @returns Array of Vite plugins
 */
export function jayStackCompiler(options: JayStackCompilerOptions = {}): Plugin[] {
    const { trackImports, ...jayOptions } = options;

    // Cache for resolved module paths
    const moduleCache = new Map<string, { path: string; code: string }>();

    // Determine if import tracking should be enabled
    const shouldTrackImports = trackImports || process.env.DEBUG_IMPORTS === '1';
    const trackerOptions: ImportChainTrackerOptions =
        typeof trackImports === 'object'
            ? trackImports
            : { verbose: process.env.DEBUG_IMPORTS === '1' };

    // Build the plugin array
    const plugins: Plugin[] = [];

    // Optional: Import chain tracker for debugging (runs first to see all imports)
    if (shouldTrackImports) {
        plugins.push(createImportChainTracker(trackerOptions));
    }

    plugins.push(
        // First: Jay Stack code splitting transformation
        {
            name: 'jay-stack:code-split',
            enforce: 'pre', // Run before jay:runtime

            transform(code: string, id: string, options) {
                // Only transform TypeScript files
                if (!id.endsWith('.ts') && !id.includes('.ts?')) {
                    return null;
                }

                // Quick check: skip files that don't use makeJayStackComponent or makeJayInit
                const hasComponent = code.includes('makeJayStackComponent');
                const hasInit = code.includes('makeJayInit');
                if (!hasComponent && !hasInit) {
                    return null;
                }

                // Determine environment from Vite's SSR flag
                // - SSR mode (options.ssr = true) → server build, strip client code
                // - Client mode (options.ssr = false/undefined) → client build, strip server code
                const environment: BuildEnvironment = options?.ssr ? 'server' : 'client';

                // Transform using existing compiler utilities
                try {
                    return transformJayStackBuilder(code, id, environment);
                } catch (error) {
                    // Log error but don't fail build - let other plugins handle it
                    console.error(`[jay-stack:code-split] Error transforming ${id}:`, error);
                    return null;
                }
            },
        },

        // Second: Action import transformation (client builds only)
        // Uses resolveId + load to replace action modules with virtual modules
        // containing createActionCaller calls BEFORE bundling happens.
        (() => {
            // Closure variable to track SSR mode
            let isSSRBuild = false;

            return {
                name: 'jay-stack:action-transform',
                enforce: 'pre' as const,

                // Track SSR mode from config
                configResolved(config: { build?: { ssr?: boolean } }) {
                    isSSRBuild = config.build?.ssr ?? false;
                },

                buildStart() {
                    // Clear caches on build start for fresh transforms
                    clearActionMetadataCache();
                    moduleCache.clear();
                },

                async resolveId(
                    source: string,
                    importer: string | undefined,
                    options: { ssr?: boolean } | undefined,
                ) {
                    // Skip SSR builds - actions should run directly on server
                    if (options?.ssr || isSSRBuild) {
                        return null;
                    }

                    // Only intercept action module imports
                    if (!isActionImport(source)) {
                        return null;
                    }

                    // Only handle relative imports (package imports work differently)
                    if (!source.startsWith('.') || !importer) {
                        return null;
                    }

                    // Resolve the actual path
                    const importerDir = path.dirname(importer);
                    let resolvedPath = path.resolve(importerDir, source);

                    // Handle extension resolution
                    if (!resolvedPath.endsWith('.ts') && !resolvedPath.endsWith('.js')) {
                        // No extension - try .ts first
                        if (fs.existsSync(resolvedPath + '.ts')) {
                            resolvedPath += '.ts';
                        } else if (fs.existsSync(resolvedPath + '.js')) {
                            resolvedPath += '.js';
                        } else {
                            return null;
                        }
                    } else if (resolvedPath.endsWith('.js') && !fs.existsSync(resolvedPath)) {
                        // .js extension but file doesn't exist - try .ts (common ESM pattern)
                        const tsPath = resolvedPath.slice(0, -3) + '.ts';
                        if (fs.existsSync(tsPath)) {
                            resolvedPath = tsPath;
                        } else {
                            return null;
                        }
                    }

                    // Return a virtual module ID that we'll handle in load
                    // The \0 prefix tells Rollup this is a virtual module
                    return `\0jay-action:${resolvedPath}`;
                },

                async load(id: string) {
                    // Only handle our virtual action modules
                    if (!id.startsWith('\0jay-action:')) {
                        return null;
                    }

                    // Extract the actual file path
                    const actualPath = id.slice('\0jay-action:'.length);

                    // Read and parse the action module
                    let code: string;
                    try {
                        code = await fs.promises.readFile(actualPath, 'utf-8');
                    } catch (err) {
                        console.error(`[action-transform] Could not read ${actualPath}:`, err);
                        return null;
                    }

                    // Extract action metadata
                    const actions = extractActionsFromSource(code, actualPath);

                    if (actions.length === 0) {
                        // No actions found - return empty module or original?
                        // Return null to let other plugins handle it
                        console.warn(`[action-transform] No actions found in ${actualPath}`);
                        return null;
                    }

                    // Generate virtual module with createActionCaller exports
                    const lines: string[] = [
                        `import { createActionCaller } from '@jay-framework/stack-client-runtime';`,
                        '',
                    ];

                    for (const action of actions) {
                        lines.push(
                            `export const ${action.exportName} = createActionCaller('${action.actionName}', '${action.method}');`,
                        );
                    }

                    // Also export any non-action exports (like types, interfaces)
                    // For now, we export ActionError from client-runtime
                    if (code.includes('ActionError')) {
                        lines.push(
                            `export { ActionError } from '@jay-framework/stack-client-runtime';`,
                        );
                    }

                    const result = lines.join('\n');
                    return result;
                },
            } as Plugin;
        })(),

        // Third: Jay runtime compilation (existing plugin)
        jayRuntime(jayOptions),
    );

    return plugins;
}
