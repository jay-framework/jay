import { Plugin } from 'vite';
import { jayRuntime, JayRollupConfig } from '@jay-framework/vite-plugin';
import { transformJayStackBuilder, BuildEnvironment } from './transform-jay-stack-builder';

export type { BuildEnvironment } from './transform-jay-stack-builder';
export { transformJayStackBuilder } from './transform-jay-stack-builder';

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
            
            transform(code: string, id: string) {
                // Check for environment query params
                const isClientBuild = id.includes('?jay-client');
                const isServerBuild = id.includes('?jay-server');
                
                if (!isClientBuild && !isServerBuild) {
                    return null; // No transformation needed
                }
                
                const environment: BuildEnvironment = isClientBuild ? 'client' : 'server';
                
                // Only transform TypeScript files
                if (!id.endsWith('.ts') && !id.includes('.ts?')) {
                    return null;
                }
                
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

