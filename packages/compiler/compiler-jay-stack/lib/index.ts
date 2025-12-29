import { Plugin } from 'vite';
import { jayRuntime, JayRollupConfig } from '@jay-framework/vite-plugin';
import { transformJayStackBuilder, BuildEnvironment } from './transform-jay-stack-builder';
import {
    transformActionImports,
    isActionImport,
    extractActionsFromSource,
    clearActionMetadataCache,
} from './transform-action-imports';
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
 * @param jayOptions - Configuration for Jay runtime (passed to jay:runtime plugin)
 * @returns Array of Vite plugins [codeSplitPlugin, actionTransformPlugin, jayRuntimePlugin]
 */
export function jayStackCompiler(jayOptions: JayRollupConfig = {}): Plugin[] {
    // Cache for resolved module paths
    const moduleCache = new Map<string, { path: string; code: string }>();

    return [
        // First: Jay Stack code splitting transformation
        {
            name: 'jay-stack:code-split',
            enforce: 'pre', // Run before jay:runtime

            transform(code: string, id: string, options) {
                // Only transform TypeScript files
                if (!id.endsWith('.ts') && !id.includes('.ts?')) {
                    return null;
                }

                // Quick check: skip files that don't use makeJayStackComponent
                const hasComponent = code.includes('makeJayStackComponent');
                if (!hasComponent) {
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
        {
            name: 'jay-stack:action-transform',
            enforce: 'pre',

            buildStart() {
                // Clear caches on build start for fresh transforms
                clearActionMetadataCache();
                moduleCache.clear();
            },

            async transform(code: string, id: string, options) {
                // Only transform for client builds (not SSR)
                if (options?.ssr) {
                    return null;
                }

                // Only transform TypeScript/JavaScript files
                if (!id.endsWith('.ts') && !id.endsWith('.js') && !id.includes('.ts?')) {
                    return null;
                }

                // Skip action module files themselves (don't transform the definitions)
                if (id.endsWith('.actions.ts') || id.endsWith('.actions.js')) {
                    return null;
                }

                // Quick check: skip files without action-like imports
                if (!isActionImport(code) && !code.includes('.actions')) {
                    return null;
                }

                try {
                    const result = await transformActionImports(
                        code,
                        id,
                        async (importSource: string, importer: string) => {
                            // Check cache first
                            const cacheKey = `${importer}:${importSource}`;
                            if (moduleCache.has(cacheKey)) {
                                return moduleCache.get(cacheKey)!;
                            }

                            // Resolve the import path
                            const importerDir = path.dirname(importer);
                            let resolvedPath: string;

                            if (importSource.startsWith('.')) {
                                // Relative import
                                resolvedPath = path.resolve(importerDir, importSource);
                                // Add .ts extension if not present
                                if (!resolvedPath.endsWith('.ts') && !resolvedPath.endsWith('.js')) {
                                    resolvedPath += '.ts';
                                }
                            } else {
                                // Package import - would need node_modules resolution
                                // For now, skip package imports
                                return null;
                            }

                            // Read the file
                            try {
                                const code = await fs.promises.readFile(resolvedPath, 'utf-8');
                                const result = { path: resolvedPath, code };
                                moduleCache.set(cacheKey, result);
                                return result;
                            } catch (err) {
                                console.warn(`[action-transform] Could not read ${resolvedPath}:`, err);
                                return null;
                            }
                        },
                    );

                    return result;
                } catch (error) {
                    console.error(`[jay-stack:action-transform] Error transforming ${id}:`, error);
                    return null;
                }
            },
        },

        // Third: Jay runtime compilation (existing plugin)
        jayRuntime(jayOptions),
    ];
}
