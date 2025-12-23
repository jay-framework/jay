import { Plugin } from 'vite';
import { jayRuntime, JayRollupConfig } from '@jay-framework/vite-plugin';
import { transformJayStackBuilder, BuildEnvironment } from './transform-jay-stack-builder';

export type { BuildEnvironment } from './transform-jay-stack-builder';
export { transformJayStackBuilder } from './transform-jay-stack-builder';
export type { JayRollupConfig } from '@jay-framework/vite-plugin';

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

        // Second: Jay runtime compilation (existing plugin)
        jayRuntime(jayOptions),
    ];
}
