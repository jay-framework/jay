/**
 * Client-side action caller for Jay Stack.
 *
 * This module provides the client-side implementation for calling server actions.
 * It replaces the server-side action handler when the action is imported in client code.
 */

/**
 * The base path for action endpoints.
 * Must match the server-side ACTION_ENDPOINT_BASE.
 */
const ACTION_ENDPOINT_BASE = '/_jay/actions';

/**
 * HTTP method types supported by actions.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Error thrown when an action fails on the server.
 * Recreated on the client from the error response.
 */
export class ActionError extends Error {
    public readonly name = 'ActionError';

    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
    }
}

/**
 * Response from the action endpoint.
 */
interface ActionResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        isActionError: boolean;
    };
}

/**
 * Options for configuring the action caller.
 */
export interface ActionCallerOptions {
    /** Base URL for action endpoints (default: '') */
    baseUrl?: string;
    /** Custom headers to include with requests */
    headers?: Record<string, string>;
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;
}

/** Global options that can be set once for all action callers */
let globalOptions: ActionCallerOptions = {};

/**
 * Sets global options for all action callers.
 *
 * @param options - Options to apply globally
 *
 * @example
 * ```typescript
 * setActionCallerOptions({
 *     baseUrl: 'https://api.example.com',
 *     headers: { 'X-Custom-Header': 'value' },
 * });
 * ```
 */
export function setActionCallerOptions(options: ActionCallerOptions): void {
    globalOptions = { ...globalOptions, ...options };
}

/**
 * Creates a client-side action caller that makes HTTP requests to the server.
 *
 * This function is used by the build transform to replace server-side action handlers
 * with client-side HTTP callers.
 *
 * @param actionName - The unique action name (matches server registration)
 * @param method - The HTTP method (default: POST)
 * @returns A callable function that makes the HTTP request
 *
 * @example
 * ```typescript
 * // Build transform replaces:
 * import { addToCart } from './actions/cart.actions';
 *
 * // With:
 * const addToCart = createActionCaller<{productId: string}, {cartCount: number}>('cart.addToCart', 'POST');
 * ```
 */
export function createActionCaller<Input, Output>(
    actionName: string,
    method: HttpMethod = 'POST',
): (input: Input) => Promise<Output> {
    return async (input: Input): Promise<Output> => {
        const baseUrl = globalOptions.baseUrl ?? '';
        const url = buildActionUrl(baseUrl, actionName, method, input);

        const fetchOptions: RequestInit = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...globalOptions.headers,
            },
        };

        // For non-GET requests, include body
        if (method !== 'GET') {
            fetchOptions.body = JSON.stringify(input);
        }

        // Add timeout via AbortController
        const timeout = globalOptions.timeout ?? 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        fetchOptions.signal = controller.signal;

        try {
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            const data: ActionResponse<Output> = await response.json();

            if (data.success) {
                return data.data as Output;
            } else {
                // Throw ActionError for business logic errors
                if (data.error) {
                    throw new ActionError(data.error.code, data.error.message);
                }
                throw new ActionError('UNKNOWN_ERROR', 'Unknown error occurred');
            }
        } catch (error) {
            clearTimeout(timeoutId);

            // Re-throw ActionError as-is
            if (error instanceof ActionError) {
                throw error;
            }

            // Handle abort (timeout)
            if (error instanceof Error && error.name === 'AbortError') {
                throw new ActionError(
                    'TIMEOUT',
                    `Action '${actionName}' timed out after ${timeout}ms`,
                );
            }

            // Handle network errors
            if (error instanceof TypeError) {
                throw new ActionError(
                    'NETWORK_ERROR',
                    `Network error calling '${actionName}': ${error.message}`,
                );
            }

            // Re-throw unknown errors
            throw error;
        }
    };
}

/**
 * Builds the action URL based on method and input.
 */
function buildActionUrl<Input>(
    baseUrl: string,
    actionName: string,
    method: HttpMethod,
    input: Input,
): string {
    const path = `${ACTION_ENDPOINT_BASE}/${actionName}`;
    const fullUrl = `${baseUrl}${path}`;

    // For GET requests, encode input in query string
    if (method === 'GET' && input !== undefined && input !== null) {
        const params = new URLSearchParams();

        // For simple objects, use individual params
        // For complex objects, use _input param
        if (isSimpleObject(input)) {
            for (const [key, value] of Object.entries(input as object)) {
                if (value !== undefined) {
                    params.append(key, String(value));
                }
            }
        } else {
            params.append('_input', JSON.stringify(input));
        }

        const queryString = params.toString();
        return queryString ? `${fullUrl}?${queryString}` : fullUrl;
    }

    return fullUrl;
}

/**
 * Checks if an object is "simple" (all values are primitives).
 */
function isSimpleObject(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }

    for (const value of Object.values(obj)) {
        if (typeof value === 'object' && value !== null) {
            return false;
        }
    }

    return true;
}
