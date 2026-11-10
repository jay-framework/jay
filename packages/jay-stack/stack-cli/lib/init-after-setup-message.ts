import {
    isServiceNotRegisteredError,
    type ServiceNotRegisteredError,
} from '@jay-framework/stack-server-runtime';

/**
 * DL#235 — the line `jay-stack setup` prints when a plugin's init fails right after its setup.
 * A missing service almost always means the plugin that provides it is not configured yet (e.g. its
 * credentials are pending), so say that instead of surfacing a "did you register it" code-bug hint.
 */
export function describeInitAfterSetupFailure(error: Error): string {
    if (isServiceNotRegisteredError(error)) {
        // Explicit type: this package resolves stack-server-runtime's JS, which drops the type predicate.
        const { serviceName } = error as ServiceNotRegisteredError;
        return (
            `Services not initialized yet: this plugin needs service '${serviceName}', which is ` +
            `not registered — the plugin that provides it is probably not configured yet. ` +
            `Configure it, then re-run setup.`
        );
    }
    return `Init after setup: ${error.message}`;
}
