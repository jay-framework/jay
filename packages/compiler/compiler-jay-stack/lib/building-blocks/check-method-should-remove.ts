import type { BuildEnvironment } from '../transform-jay-stack-builder';

// ============================================================================
// makeJayStackComponent methods
// ============================================================================

const COMPONENT_SERVER_METHODS = new Set([
    'withServices',
    'withLoadParams',
    'withSlowlyRender',
    'withFastRender',
]);

const COMPONENT_CLIENT_METHODS = new Set(['withInteractive', 'withContexts']);

// ============================================================================
// makeJayInit methods
// ============================================================================

const INIT_SERVER_METHODS = new Set(['withServer']);

const INIT_CLIENT_METHODS = new Set(['withClient']);

/**
 * Check if a builder method should be removed for the given environment
 */
export function shouldRemoveMethod(methodName: string, environment: BuildEnvironment): boolean {
    // Component methods
    if (environment === 'client' && COMPONENT_SERVER_METHODS.has(methodName)) return true;
    if (environment === 'server' && COMPONENT_CLIENT_METHODS.has(methodName)) return true;

    // Init methods
    if (environment === 'client' && INIT_SERVER_METHODS.has(methodName)) return true;
    if (environment === 'server' && INIT_CLIENT_METHODS.has(methodName)) return true;

    return false;
}
