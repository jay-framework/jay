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

/** The base path for deferred-result polls (DL#239). Must match the server. */
const ACTION_RESULT_BASE = '/_jay/action-results';

/** The request header carrying the client-derived ticket on a deferrable request (DL#239). */
const TICKET_HEADER = 'Jay-Action-Ticket';

/** Monotonic per-page counter so each pollable call derives a distinct ticket from the seed. */
let ticketCounter = 0;

/**
 * The server-issued, HMAC-signed seed injected into the page as `window.__jay.actionSeed` (DL#239).
 * Absent when the project has no long-request poll budget configured — then calls behave exactly as before.
 */
function getActionSeed(): string | undefined {
    const jay = (globalThis as unknown as { __jay?: { actionSeed?: unknown } }).__jay;
    return typeof jay?.actionSeed === 'string' ? jay.actionSeed : undefined;
}

/** A fresh ticket `seed.<counter>` for this call, or undefined when there is no seed. */
function deriveTicket(): string | undefined {
    const seed = getActionSeed();
    return seed ? `${seed}.${ticketCounter++}` : undefined;
}

/** A gateway cut the client can recover from by polling the ticket it already holds. */
function isGatewayStatus(status: number): boolean {
    return status === 502 || status === 503 || status === 504;
}

/** A thrown fetch error that is a transient connection failure (not our own timeout abort). */
function isNetworkError(error: unknown): boolean {
    return error instanceof TypeError;
}

/** Fetch bounded by an absolute deadline shared across the initial request and all polls. */
async function fetchWithDeadline(
    url: string,
    init: RequestInit,
    deadline: number,
): Promise<Response> {
    const controller = new AbortController();
    const remaining = Math.max(0, deadline - Date.now());
    const timeoutId = setTimeout(() => controller.abort(), remaining);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

/** Parses a final action JSON response into the output or an ActionError. */
async function parseActionResponse<Output>(
    response: Response,
    actionName: string,
): Promise<Output> {
    const data: ActionResponse<Output> = await response.json();
    if (data.success) return data.data as Output;
    if (data.error) throw new ActionError(data.error.code, data.error.message);
    throw new ActionError('UNKNOWN_ERROR', `Action '${actionName}' failed`);
}

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

/**
 * True for native Blob/File and for objects that quack like a Blob (some reactive
 * proxies fail `instanceof Blob`, which would otherwise send uploads through `_json`
 * and strip binaries).
 */
function isBlobLike(value: unknown): value is Blob {
    if (typeof value !== 'object' || value === null) return false;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
    const b = value as Partial<Blob>;
    return (
        typeof b.size === 'number' &&
        !Number.isNaN(b.size) &&
        typeof b.arrayBuffer === 'function' &&
        typeof b.slice === 'function'
    );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' && value !== null && !Array.isArray(value) && !isBlobLike(value)
    );
}

function blobPartFilename(blob: Blob, fallback: string): string {
    if (typeof File !== 'undefined' && blob instanceof File && blob.name) return blob.name;
    return fallback;
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
        if (!isBlobLike(v)) return false;
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
        if (isBlobLike(value)) {
            const name = blobPartFilename(value, `${key}.bin`);
            formData.append(key, value, name);
        } else if (Array.isArray(value) && value.some((v) => isBlobLike(v))) {
            const nonFiles: any[] = [];
            for (const item of value) {
                if (isBlobLike(item)) {
                    const name = blobPartFilename(item, `${key}.bin`);
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
                const name = blobPartFilename(blob, `${subKey}.bin`);
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
        if (isBlobLike(value)) return true;
        if (Array.isArray(value) && value.some((v) => isBlobLike(v))) return true;
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

        // Deferral (DL#239): derive a ticket up front so a gateway cut can be resumed by polling.
        const ticket = deriveTicket();

        const fetchOptions: RequestInit = {
            method,
            headers: {
                ...(useFormData ? {} : { 'Content-Type': 'application/json' }),
                ...globalOptions.headers,
                ...(ticket ? { [TICKET_HEADER]: ticket } : {}),
            },
        };

        // For non-GET requests, include body
        if (method !== 'GET') {
            fetchOptions.body = useFormData ? buildFormData(input) : JSON.stringify(input);
        }

        // The client `timeout` is the overall deadline for the call, spanning the first request and
        // every poll (DL#239 TL;DR 8). Each individual fetch is bounded by it, never by the gateway.
        const timeout = globalOptions.timeout ?? 30000;
        const deadline = Date.now() + timeout;

        try {
            const response = await fetchWithDeadline(url, fetchOptions, deadline);

            // 202, or a gateway cut, means the handler is still running — fall through to polling the
            // ticket the client already holds.
            if (ticket && (response.status === 202 || isGatewayStatus(response.status))) {
                return pollForResult<Output>(baseUrl, ticket, actionName, deadline);
            }
            return await parseActionResponse<Output>(response, actionName);
        } catch (error) {
            if (error instanceof ActionError) throw error;

            // A network-level cut on the POST is resumable when we hold a ticket.
            if (ticket && isNetworkError(error)) {
                return pollForResult<Output>(baseUrl, ticket, actionName, deadline);
            }
            if (error instanceof Error && error.name === 'AbortError') {
                throw new ActionError(
                    'TIMEOUT',
                    `Action '${actionName}' timed out after ${timeout}ms`,
                );
            }
            if (error instanceof TypeError) {
                throw new ActionError(
                    'NETWORK_ERROR',
                    `Network error calling '${actionName}': ${error.message}`,
                );
            }
            throw error;
        }
    };
}

/**
 * Long-polls `GET /_jay/action-results/<ticket>` until the deferred result settles (DL#239). Each
 * poll is held server-side up to the budget, so this does not busy-loop. A transient 5xx or network
 * error is retried up to twice; a `404` means the result is gone; the overall deadline still bounds
 * the whole operation.
 */
async function pollForResult<Output>(
    baseUrl: string,
    ticket: string,
    actionName: string,
    deadline: number,
): Promise<Output> {
    const url = `${baseUrl}${ACTION_RESULT_BASE}/${ticket}`;
    let noProgressRetries = 0;

    for (;;) {
        if (Date.now() >= deadline) {
            throw new ActionError(
                'TIMEOUT',
                `Action '${actionName}' timed out while awaiting result`,
            );
        }

        let response: Response;
        try {
            response = await fetchWithDeadline(
                url,
                { method: 'GET', headers: { ...globalOptions.headers } },
                deadline,
            );
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new ActionError(
                    'TIMEOUT',
                    `Action '${actionName}' timed out while awaiting result`,
                );
            }
            if (isNetworkError(error) && noProgressRetries++ < 2) continue;
            throw new ActionError('NETWORK_ERROR', `Network error awaiting '${actionName}'`);
        }

        if (response.status === 202) {
            noProgressRetries = 0;
            continue;
        }
        if (response.status === 404) {
            throw new ActionError(
                'RESULT_NOT_FOUND',
                `Result for '${actionName}' is no longer available (server restarted or result expired)`,
            );
        }
        if (isGatewayStatus(response.status)) {
            if (noProgressRetries++ < 2) continue;
            throw new ActionError(
                'NETWORK_ERROR',
                `Repeated gateway errors awaiting '${actionName}'`,
            );
        }
        return parseActionResponse<Output>(response, actionName);
    }
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
    return (input: Input): AsyncIterable<Chunk> =>
        streamChunks<Input, Chunk>(actionName, input, options);
}

/** Outcome of reading one NDJSON segment to exhaustion. */
type SegmentEnd = 'done' | 'resume' | 'cut';

/**
 * Reads an action's NDJSON stream as an async generator (DL#239). While a budget is configured and
 * a seed is present, the stream is delivered in segments: a `{"resume":true}` line (or a gateway
 * cut) ends a segment early, and the generator reopens `GET /_jay/action-results/<ticket>?from=N`
 * with the count it has already received. Without a ticket it behaves as a single stream, but an
 * unexpected end is now an error rather than a silent finish. Breaking the `for await` aborts the
 * in-flight fetch (the generator's `return`), which is TL;DR 12's client-side cancel.
 */
async function* streamChunks<Input, Chunk>(
    actionName: string,
    input: Input,
    options?: CreateActionCallerOptions,
): AsyncGenerator<Chunk> {
    const baseUrl = globalOptions.baseUrl ?? '';
    const useFormData = options?.acceptsFiles && hasFiles(input);
    const ticket = deriveTicket();
    const controller = new AbortController();

    let received = 0;
    let noProgressRetries = 0;

    try {
        // Open the initial segment with a POST.
        let response = await openStreamSegment(
            `${baseUrl}${ACTION_ENDPOINT_BASE}/${actionName}`,
            {
                method: 'POST',
                headers: {
                    ...(useFormData ? {} : { 'Content-Type': 'application/json' }),
                    ...globalOptions.headers,
                    ...(ticket ? { [TICKET_HEADER]: ticket } : {}),
                },
                body: useFormData ? buildFormData(input) : JSON.stringify(input),
                signal: controller.signal,
            },
            actionName,
        );

        for (;;) {
            let end: SegmentEnd = 'cut';
            const before = received;
            try {
                const reader = response.body!.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let finished = false;
                while (!finished) {
                    const { done: readerDone, value } = await reader.read();
                    if (value) buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = readerDone ? '' : lines.pop()!;
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        const parsed = JSON.parse(line);
                        if (parsed.error !== undefined && parsed.error !== null) {
                            throw new ActionError('STREAM_ERROR', String(parsed.error));
                        }
                        if (parsed.done) {
                            end = 'done';
                            finished = true;
                            break;
                        }
                        if (parsed.resume) {
                            end = 'resume';
                            finished = true;
                            break;
                        }
                        if ('chunk' in parsed) {
                            received++;
                            yield parsed.chunk as Chunk;
                        }
                    }
                    if (readerDone) break;
                }
            } catch (err) {
                if (err instanceof ActionError) throw err;
                // A network cut mid-segment: fall through to resume if we can.
                end = 'cut';
            }

            if (end === 'done') return;

            // Decide whether to resume. Without a ticket, only a clean 'done' is acceptable.
            if (!ticket) {
                throw new ActionError('STREAM_ERROR', `Stream '${actionName}' ended unexpectedly`);
            }

            const progressed = received > before;
            noProgressRetries = progressed ? 0 : noProgressRetries + 1;
            if (!progressed && noProgressRetries > 2) {
                throw new ActionError('STREAM_ERROR', `Stream '${actionName}' ended unexpectedly`);
            }

            response = await openStreamSegment(
                `${baseUrl}${ACTION_RESULT_BASE}/${ticket}?from=${received}`,
                { method: 'GET', headers: { ...globalOptions.headers }, signal: controller.signal },
                actionName,
            );
        }
    } finally {
        // Consumer stopped early (break) or we are unwinding — stop the in-flight fetch.
        controller.abort();
    }
}

/** Opens a stream segment, mapping a 404 to RESULT_NOT_FOUND and a non-ok status to a resumable cut. */
async function openStreamSegment(
    url: string,
    init: RequestInit,
    actionName: string,
): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url, init);
    } catch (err) {
        // Treat a network cut as a resumable empty segment (the caller retries from the cursor).
        return emptyCutResponse();
    }
    if (response.status === 404) {
        throw new ActionError(
            'RESULT_NOT_FOUND',
            `Result for '${actionName}' is no longer available (server restarted or result expired)`,
        );
    }
    if (!response.ok || !response.body) return emptyCutResponse();
    return response;
}

/** A body-less NDJSON response that reads as an immediate cut, so the generator resumes. */
function emptyCutResponse(): Response {
    return new Response(new Blob([]), { status: 200 });
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
