import { createRequire } from 'module';
import type * as typescript from 'typescript';

const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof typescript;

/**
 * Re-export the TypeScript module to avoid ESM/CommonJS compatibility issues
 * This allows importing TypeScript in a consistent way across the project
 */
export const ts = tsModule;

/**
 * Re-export the TypeScript types for use in type annotations
 */
export type { typescript as TypeScript };

/**
 * Create a proxy that forwards all property access to the TypeScript module
 * This allows accessing any TypeScript utility without explicitly listing them
 */
export const tsBridge = new Proxy(tsModule, {
    get(target, prop) {
        return target[prop as keyof typeof tsModule];
    },
});

/**
 * Alternative approach: Create a function that returns any TypeScript utility
 * Usage: getTs('isIdentifier')(node)
 */
export function getTs<T extends keyof typeof tsModule>(utilName: T): (typeof tsModule)[T] {
    return tsModule[utilName];
}

/**
 * Default export for easy importing and destructuring
 * Usage: import tsBridge, { ts } from '@jay-framework/typescript-bridge'
 */
export default tsBridge;
