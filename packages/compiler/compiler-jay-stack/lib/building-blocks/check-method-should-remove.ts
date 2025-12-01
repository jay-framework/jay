import type { BuildEnvironment } from '../transform-jay-stack-builder';

const SERVER_METHODS = new Set([
    'withServices',
    'withLoadParams',
    'withSlowlyRender',
    'withFastRender',
]);

const CLIENT_METHODS = new Set([
    'withInteractive',
    'withContexts',
]);

/**
 * Check if a builder method should be removed for the given environment
 */
export function shouldRemoveMethod(methodName: string, environment: BuildEnvironment): boolean {
    return (
        (environment === 'client' && SERVER_METHODS.has(methodName)) ||
        (environment === 'server' && CLIENT_METHODS.has(methodName))
    );
}

