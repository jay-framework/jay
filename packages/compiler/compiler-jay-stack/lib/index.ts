import { Plugin } from 'vite';
import { jayRuntime, JayRollupConfig } from '@jay-framework/vite-plugin';
import { transformJayStackBuilder, BuildEnvironment } from './transform-jay-stack-builder';

export type { BuildEnvironment, TransformOptions } from './transform-jay-stack-builder';
export { transformJayStackBuilder } from './transform-jay-stack-builder';
export type { JayRollupConfig } from '@jay-framework/vite-plugin';

/**
 * Jay Stack Compiler - Handles both Jay runtime compilation and Jay Stack code splitting
 *
 * This plugin internally uses the jay:runtime plugin and adds Jay Stack-specific
 * transformations for client/server code splitting.
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
 * @returns Array of Vite plugins [codeSplitPlugin, jayRuntimePlugin]
 */
export function jayStackCompiler(jayOptions: JayRollupConfig = {}): Plugin[] {
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

                // Determine environment and whether to propagate query params:
                // - ?jay-client → client, propagate (package build)
                // - ?jay-server → server, propagate (package build)
                // - SSR mode (no query param) → server, DON'T propagate (dev server - preserve module identity)
                // - Client mode (no query param) → no transformation
                const isClientBuild = id.includes('?jay-client');
                const isServerBuild = id.includes('?jay-server');
                const isSSR = options?.ssr === true;

                let environment: BuildEnvironment;
                let propagateQueryParams: boolean;

                if (isClientBuild) {
                    environment = 'client';
                    propagateQueryParams = true; // Package build - need to propagate
                } else if (isServerBuild) {
                    environment = 'server';
                    propagateQueryParams = true; // Package build - need to propagate
                } else if (isSSR) {
                    environment = 'server';
                    propagateQueryParams = false; // Dev server SSR - preserve module identity
                } else {
                    // Client bundle without explicit query param - no transformation
                    return null;
                }

                // Quick check: skip files that don't use makeJayStackComponent
                // But for re-exports (like index.ts), we still need to rewrite the export paths
                const hasComponent = code.includes('makeJayStackComponent');
                const hasReExport = code.includes('export *') || code.includes('export {');

                if (!hasComponent && !hasReExport) {
                    return null;
                }

                // Transform using existing compiler utilities
                try {
                    return transformJayStackBuilder(code, id, environment, {
                        propagateQueryParams,
                    });
                } catch (error) {
                    // Log error but don't fail build - let other plugins handle it
                    console.error(`[jay-stack:code-split] Error transforming ${id}:`, error);
                    return null;
                }
            },
        },

        // Second: Jay runtime compilation (existing plugin)
        jayRuntime(jayOptions),
    ];
}
