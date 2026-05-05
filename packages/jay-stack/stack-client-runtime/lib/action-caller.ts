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
/**
 * Options for action callers.
 */
export interface CreateActionCallerOptions {
    /** Whether this action accepts file uploads (DL#131) */
    acceptsFiles?: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Blob);
}

/**
 * One-level record of Blobs only (e.g. `extraFiles` on submit-task). Nested File maps
 * must not be JSON-stringified into `_json` — that strips binaries and breaks server
 * handlers (clipboard images, etc.).
 */
function isRecordOfBlobs(value: unknown): value is Record<string, Blob> {
    if (!isPlainRecord(value)) return false;
    const vals = Object.values(value);
    if (vals.length === 0) return false;
    for (const v of vals) {
        if (!(v instanceof Blob)) return false;
    }
    return true;
}

/**
 * Build a FormData body from an input object (DL#131).
 * File/Blob values become file fields; everything else goes into a `_json` field.
 */
function buildFormData(input: any): FormData {
    const formData = new FormData();
    const jsonFields: Record<string, any> = {};

    for (const [key, value] of Object.entries(input)) {
        if (value instanceof Blob) {
            const name = value instanceof File ? value.name : `${key}.bin`;
            formData.append(key, value, name);
        } else if (Array.isArray(value) && value.some((v) => v instanceof Blob)) {
            const nonFiles: any[] = [];
            for (const item of value) {
                if (item instanceof Blob) {
                    const name = item instanceof File ? item.name : `${key}.bin`;
                    formData.append(key, item, name);
                } else {
                    nonFiles.push(item);
                }
            }
            if (nonFiles.length > 0) {
                jsonFields[key] = nonFiles;
            }
        } else if (isRecordOfBlobs(value)) {
            for (const [subKey, blob] of Object.entries(value)) {
                const name = blob instanceof File ? blob.name : `${subKey}.bin`;
                formData.append(`${key}.${subKey}`, blob, name);
            }
        } else {
            jsonFields[key] = value;
        }
    }

    if (Object.keys(jsonFields).length > 0) {
        formData.append('_json', JSON.stringify(jsonFields));
    }

    return formData;
}

/**
 * Check if an input object contains File or Blob values.
 */
function hasFiles(input: any): boolean {
    if (typeof input !== 'object' || input === null) return false;
    for (const value of Object.values(input)) {
        if (value instanceof Blob) return true;
        if (Array.isArray(value) && value.some((v) => v instanceof Blob)) return true;
        if (isRecordOfBlobs(value)) return true;
    }
    return false;
}

export function createActionCaller<Input, Output>(
    actionName: string,
    method: HttpMethod = 'POST',
    options?: CreateActionCallerOptions,
): (input: Input) => Promise<Output> {
    return async (input: Input): Promise<Output> => {
        const baseUrl = globalOptions.baseUrl ?? '';
        const useFormData = options?.acceptsFiles && hasFiles(input);
        const url = useFormData
            ? `${baseUrl}${ACTION_ENDPOINT_BASE}/${actionName}`
            : buildActionUrl(baseUrl, actionName, method, input);

        const fetchOptions: RequestInit = {
            method,
            headers: {
                ...(useFormData ? {} : { 'Content-Type': 'application/json' }),
                ...globalOptions.headers,
            },
        };

        // For non-GET requests, include body
        if (method !== 'GET') {
            fetchOptions.body = useFormData ? buildFormData(input) : JSON.stringify(input);
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
 * Creates a client-side stream caller that makes an HTTP request and returns
 * an async iterable of chunks via NDJSON streaming.
 *
 * This function is used by the build transform to replace server-side makeJayStream
 * handlers with client-side HTTP stream consumers.
 *
 * @param actionName - The unique action name (matches server registration)
 * @returns A callable function that returns an AsyncIterable of chunks
 *
 * @example
 * ```typescript
 * // Build transform replaces:
 * import { checkInventory } from './actions/inventory-check.actions';
 *
 * // With:
 * const checkInventory = createStreamCaller<void, { name: string }>('inventory.check');
 * ```
 */
export function createStreamCaller<Input, Chunk>(
    actionName: string,
    options?: CreateActionCallerOptions,
): (input: Input) => AsyncIterable<Chunk> {
    return (input: Input): AsyncIterable<Chunk> => {
        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<Chunk> {
                const baseUrl = globalOptions.baseUrl ?? '';
                const url = `${baseUrl}${ACTION_ENDPOINT_BASE}/${actionName}`;
                const useFormData = options?.acceptsFiles && hasFiles(input);

                let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
                let buffer = '';
                let done = false;
                let error: Error | null = null;
                const chunks: Chunk[] = [];
                let resolveNext: (() => void) | null = null;

                // Start the fetch immediately
                const fetchPromise = fetch(url, {
                    method: 'POST',
                    headers: {
                        ...(useFormData ? {} : { 'Content-Type': 'application/json' }),
                        ...globalOptions.headers,
                    },
                    body: useFormData ? buildFormData(input) : JSON.stringify(input),
                })
                    .then((response) => {
                        if (!response.ok) {
                            throw new ActionError(
                                'STREAM_ERROR',
                                `Stream '${actionName}' failed with status ${response.status}`,
                            );
                        }
                        reader = response.body!.getReader();
                        pump();
                    })
                    .catch((err) => {
                        error =
                            err instanceof ActionError
                                ? err
                                : new ActionError(
                                      'NETWORK_ERROR',
                                      `Network error streaming '${actionName}': ${err.message}`,
                                  );
                        if (resolveNext) resolveNext();
                    });

                const decoder = new TextDecoder();

                function pump() {
                    reader!
                        .read()
                        .then(({ done: readerDone, value }) => {
                            if (value) {
                                buffer += decoder.decode(value, { stream: true });
                                // Process complete lines
                                const lines = buffer.split('\n');
                                buffer = lines.pop()!; // Keep incomplete line in buffer
                                for (const line of lines) {
                                    if (!line.trim()) continue;
                                    const parsed = JSON.parse(line);
                                    if (parsed.error) {
                                        error = new ActionError('STREAM_ERROR', parsed.error);
                                        if (resolveNext) resolveNext();
                                        return;
                                    }
                                    if (parsed.done) {
                                        done = true;
                                        if (resolveNext) resolveNext();
                                        return;
                                    }
                                    if ('chunk' in parsed) {
                                        chunks.push(parsed.chunk);
                                        if (resolveNext) resolveNext();
                                    }
                                }
                            }
                            if (readerDone) {
                                done = true;
                                if (resolveNext) resolveNext();
                                return;
                            }
                            pump();
                        })
                        .catch((err) => {
                            error = new ActionError('STREAM_ERROR', err.message);
                            if (resolveNext) resolveNext();
                        });
                }

                return {
                    async next(): Promise<IteratorResult<Chunk>> {
                        // Wait for fetch to start
                        await fetchPromise;

                        while (true) {
                            if (chunks.length > 0) {
                                return { value: chunks.shift()!, done: false };
                            }
                            if (error) {
                                throw error;
                            }
                            if (done) {
                                return { value: undefined as any, done: true };
                            }
                            // Wait for more data
                            await new Promise<void>((resolve) => {
                                resolveNext = resolve;
                            });
                            resolveNext = null;
                        }
                    },
                    [Symbol.asyncIterator]() {
                        return this;
                    },
                };
            },
        };
    };
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
