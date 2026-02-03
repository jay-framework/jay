/**
 * Action registry for Jay Stack server-side action handling.
 *
 * Actions are registered at build/startup time and can be invoked via HTTP.
 * The registry maps action names to their definitions (handler, services, method, etc.).
 */

import type {
    JayAction,
    JayActionDefinition,
    HttpMethod,
    CacheOptions,
    ActionError,
} from '@jay-framework/fullstack-component';
import { resolveServices } from './services';

// ============================================================================
// Action Registry Types
// ============================================================================

/**
 * Registered action entry with resolved metadata.
 */
export interface RegisteredAction {
    /** Unique action name */
    actionName: string;

    /** HTTP method */
    method: HttpMethod;

    /** Cache options (for GET requests) */
    cacheOptions?: CacheOptions;

    /** Service markers for dependency injection */
    services: any[];

    /** The handler function */
    handler: (input: any, ...services: any[]) => Promise<any>;
}

/**
 * Result of executing an action.
 */
export type ActionExecutionResult<T> =
    | { success: true; data: T }
    | { success: false; error: ActionErrorResponse };

/**
 * Error response structure for failed actions.
 */
export interface ActionErrorResponse {
    code: string;
    message: string;
    isActionError: boolean;
}

// ============================================================================
// Action Registry Class
// ============================================================================

/**
 * Registry for Jay Stack server actions.
 *
 * Manages action registration, lookup, and execution.
 * Create instances for testing or use the default export for production.
 *
 * @example
 * ```typescript
 * // For testing - create isolated instance
 * const registry = new ActionRegistry();
 * registry.register(myAction);
 * const result = await registry.execute('my.action', input);
 *
 * // For production - use default instance
 * import { actionRegistry } from '@jay-framework/stack-server-runtime';
 * actionRegistry.register(myAction);
 * ```
 */
export class ActionRegistry {
    private readonly actions = new Map<string, RegisteredAction>();

    /**
     * Registers an action with the registry.
     *
     * @param action - The JayAction to register (created via makeJayAction/makeJayQuery)
     */
    register<I, O, S extends any[]>(action: JayAction<I, O> & JayActionDefinition<I, O, S>): void {
        const entry: RegisteredAction = {
            actionName: action.actionName,
            method: action.method,
            cacheOptions: action.cacheOptions,
            services: action.services as any[],
            handler: action.handler,
        };

        this.actions.set(action.actionName, entry);
    }

    /**
     * Retrieves a registered action by name.
     *
     * @param actionName - The unique action name
     * @returns The registered action or undefined
     */
    get(actionName: string): RegisteredAction | undefined {
        return this.actions.get(actionName);
    }

    /**
     * Checks if an action is registered.
     *
     * @param actionName - The unique action name
     * @returns true if the action is registered
     */
    has(actionName: string): boolean {
        return this.actions.has(actionName);
    }

    /**
     * Gets all registered action names.
     *
     * @returns Array of registered action names
     */
    getNames(): string[] {
        return Array.from(this.actions.keys());
    }

    /**
     * Clears all registered actions.
     */
    clear(): void {
        this.actions.clear();
    }

    /**
     * Executes a registered action with the given input.
     * Resolves services and calls the handler.
     *
     * @param actionName - The action to execute
     * @param input - The input data for the action
     * @returns The action result or error
     */
    async execute<T = any>(actionName: string, input: unknown): Promise<ActionExecutionResult<T>> {
        const action = this.actions.get(actionName);

        if (!action) {
            return {
                success: false,
                error: {
                    code: 'ACTION_NOT_FOUND',
                    message: `Action '${actionName}' is not registered`,
                    isActionError: false,
                },
            };
        }

        try {
            // Resolve services
            const services = resolveServices(action.services);

            // Execute handler
            const result = await action.handler(input, ...services);

            return {
                success: true,
                data: result as T,
            };
        } catch (error: unknown) {
            // Check if it's an ActionError
            if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
                const actionError = error as { code: string; message: string; name?: string };
                if (actionError.name === 'ActionError') {
                    return {
                        success: false,
                        error: {
                            code: actionError.code,
                            message: actionError.message,
                            isActionError: true,
                        },
                    };
                }
            }

            // Generic error
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message,
                    isActionError: false,
                },
            };
        }
    }

    /**
     * Gets the cache headers for an action (if applicable).
     *
     * @param actionName - The action name
     * @returns Cache-Control header value or undefined
     */
    getCacheHeaders(actionName: string): string | undefined {
        const action = this.actions.get(actionName);

        if (!action || action.method !== 'GET' || !action.cacheOptions) {
            return undefined;
        }

        const { maxAge, staleWhileRevalidate } = action.cacheOptions;
        const parts: string[] = [];

        if (maxAge !== undefined) {
            parts.push(`max-age=${maxAge}`);
        }

        if (staleWhileRevalidate !== undefined) {
            parts.push(`stale-while-revalidate=${staleWhileRevalidate}`);
        }

        return parts.length > 0 ? parts.join(', ') : undefined;
    }
}

// ============================================================================
// Default Instance (for production use)
// ============================================================================

/**
 * Default action registry instance.
 * Use this for production; create new instances for testing.
 */
export const actionRegistry = new ActionRegistry();

// ============================================================================
// Legacy Function Exports (for backwards compatibility)
// ============================================================================

/**
 * Registers an action with the default registry.
 * @deprecated Use actionRegistry.register() instead
 */
export function registerAction<I, O, S extends any[]>(
    action: JayAction<I, O> & JayActionDefinition<I, O, S>,
): void {
    actionRegistry.register(action);
}

/**
 * Retrieves a registered action by name from the default registry.
 * @deprecated Use actionRegistry.get() instead
 */
export function getRegisteredAction(actionName: string): RegisteredAction | undefined {
    return actionRegistry.get(actionName);
}

/**
 * Checks if an action is registered in the default registry.
 * @deprecated Use actionRegistry.has() instead
 */
export function hasAction(actionName: string): boolean {
    return actionRegistry.has(actionName);
}

/**
 * Gets all registered action names from the default registry.
 * @deprecated Use actionRegistry.getNames() instead
 */
export function getRegisteredActionNames(): string[] {
    return actionRegistry.getNames();
}

/**
 * Clears all registered actions from the default registry.
 * @deprecated Use actionRegistry.clear() instead
 */
export function clearActionRegistry(): void {
    actionRegistry.clear();
}

/**
 * Executes an action from the default registry.
 * @deprecated Use actionRegistry.execute() instead
 */
export async function executeAction<T = any>(
    actionName: string,
    input: unknown,
): Promise<ActionExecutionResult<T>> {
    return actionRegistry.execute(actionName, input);
}

/**
 * Gets cache headers for an action from the default registry.
 * @deprecated Use actionRegistry.getCacheHeaders() instead
 */
export function getActionCacheHeaders(actionName: string): string | undefined {
    return actionRegistry.getCacheHeaders(actionName);
}
