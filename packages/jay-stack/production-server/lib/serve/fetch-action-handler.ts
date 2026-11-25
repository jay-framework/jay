import {
    ActionRegistry,
    actionRegistry,
    crossOriginErrorResponse,
    DEFAULT_ACTION_BODY_LIMIT_BYTES,
    payloadTooLargeResponse,
    isCrossOriginRequest,
    isSecureRequest,
    needsSameOriginCheck,
    parseCookies,
    runPollable,
    awaitTicket,
    verifyTicket,
    peekTicketMeta,
    openStreamTicket,
    readStreamSegment,
    type ActionErrorResponse,
    type ActionExecutionResult,
    type IncomingRequest,
    type Settled,
    type StreamSegmentEvent,
} from '@jay-framework/stack-server-runtime';
import {
    isJayAction,
    isJayStreamAction,
    type HttpMethod,
} from '@jay-framework/fullstack-component';
import { getLogger } from '@jay-framework/logger';

const ACTION_PREFIX = '/_jay/actions/';
const ACTION_RESULT_PREFIX = '/_jay/action-results/';

/** The request header carrying the client-derived ticket on a deferrable POST (DL#239). */
const TICKET_HEADER = 'jay-action-ticket';

/** Replaces INTERNAL_ERROR messages on the wire; the original is logged server-side (DL#234). */
const GENERIC_INTERNAL_MESSAGE = 'Internal server error';

/** Never cache a polled 202 or any poll response (DL#239, DL#230). */
const NO_STORE: Record<string, string> = { 'Cache-Control': 'private, no-store' };

export interface FetchActionOptions {
    /** Cap on a JSON action request body in UTF-8 bytes (default: DEFAULT_ACTION_BODY_LIMIT_BYTES) */
    actionBodyLimitBytes?: number;
    /** Long-request poll budget in ms (DL#239); absent → off. A poll waits up to this too. */
    actionPollAfterMs?: number;
}

export function isActionRequest(pathname: string): boolean {
    return pathname.startsWith(ACTION_PREFIX);
}

/** Whether `pathname` is a polled-result poll, `/_jay/action-results/<ticket>` (DL#239). */
export function isActionResultRequest(pathname: string): boolean {
    return pathname.startsWith(ACTION_RESULT_PREFIX);
}

export async function fetchActionRequest(
    request: Request,
    registry: ActionRegistry = actionRegistry,
    options: FetchActionOptions = {},
): Promise<Response> {
    const limitBytes = options.actionBodyLimitBytes ?? DEFAULT_ACTION_BODY_LIMIT_BYTES;
    const url = new URL(request.url);
    const actionName = url.pathname.slice(ACTION_PREFIX.length);

    if (!actionName) {
        return jsonResponse(400, {
            success: false,
            error: {
                code: 'MISSING_ACTION_NAME',
                message: 'Action name is required',
                isActionError: false,
            },
        });
    }

    const action = registry.get(actionName);
    if (!action) {
        return jsonResponse(404, {
            success: false,
            error: {
                code: 'ACTION_NOT_FOUND',
                message: `Action '${actionName}' is not registered`,
                isActionError: false,
            },
        });
    }

    const requestMethod = request.method.toUpperCase() as HttpMethod;
    if (requestMethod !== action.method) {
        return jsonResponse(405, {
            success: false,
            error: {
                code: 'METHOD_NOT_ALLOWED',
                message: `Action '${actionName}' expects ${action.method}, got ${requestMethod}`,
                isActionError: false,
            },
        });
    }

    if (needsSameOriginCheck(action) && isCrossOrigin(request, url)) {
        return jsonResponse(403, crossOriginErrorResponse(actionName));
    }

    if (requestMethod !== 'GET' && declaredLengthExceeds(request, limitBytes)) {
        return jsonResponse(413, payloadTooLargeResponse(limitBytes));
    }

    let input: unknown;
    try {
        if (requestMethod === 'GET') {
            const inputParam = url.searchParams.get('_input');
            if (inputParam) {
                input = JSON.parse(inputParam);
            } else {
                input = Object.fromEntries(url.searchParams.entries());
                delete (input as any)._input;
            }
        } else {
            const text = await readBodyWithinLimit(request, limitBytes);
            if (text === BODY_TOO_LARGE) {
                return jsonResponse(413, payloadTooLargeResponse(limitBytes));
            }
            input = text ? JSON.parse(text) : {};
        }
    } catch {
        return jsonResponse(400, {
            success: false,
            error: {
                code: 'INVALID_INPUT',
                message: 'Failed to parse request input',
                isActionError: false,
            },
        });
    }

    const incoming = action.needsRequest ? readIncomingRequest(request, url) : undefined;
    const perUserHeaders: Record<string, string> = action.needsRequest
        ? { 'Cache-Control': registry.getCacheHeaders(actionName)! }
        : {};

    // Long-request polling (DL#239): when a budget is configured and the request carries a valid
    // ticket, a request that runs past the budget is broken into an initial response plus follow-up
    // polls, instead of being held open past an upstream gateway's limit.
    const ticket = request.headers.get(TICKET_HEADER);
    const pollable =
        typeof options.actionPollAfterMs === 'number' && !!ticket && verifyTicket(ticket);
    const budget = options.actionPollAfterMs ?? 0;
    const meta = { actionName, needsSameOriginCheck: needsSameOriginCheck(action) };

    if (registry.isStreaming(actionName)) {
        if (pollable) {
            openStreamTicket(
                ticket!,
                registry.executeStream(actionName, input, incoming),
                meta,
                budget * 2,
            );
            return streamSegmentResponse(actionName, ticket!, 0, budget, perUserHeaders);
        }
        return directStreamResponse(registry, actionName, input, incoming, perUserHeaders);
    }

    if (pollable) {
        const outcome = await runPollable<ActionExecutionResult<unknown>>(
            ticket!,
            () => registry.execute(actionName, input, incoming),
            budget,
            meta,
        );
        if (outcome.kind === 'pending') {
            return jsonResponse(202, { pending: { ticket } }, new Headers(NO_STORE));
        }
        // Within budget: this was not polled, so the response is identical to today's — including
        // GET cache headers. Only the 202 and the poll delivery are no-store (DL#239 Q4).
        return deliverSettled(
            actionName,
            outcome.settled,
            requestMethod,
            registry,
            perUserHeaders,
            false,
        );
    }

    const result = await registry.execute(actionName, input, incoming);
    return deliverResult(actionName, result, requestMethod, registry, perUserHeaders, false);
}

/**
 * Poll handler for `GET /_jay/action-results/<ticket>` (DL#239). Delivers a value ticket as JSON
 * (202 while still running, final on settle) or a stream ticket as one NDJSON segment from
 * `?from=<cursor>`. An unknown, expired or bad-MAC ticket is `404 RESULT_NOT_FOUND`.
 */
export async function fetchActionResultRequest(
    request: Request,
    registry: ActionRegistry = actionRegistry,
    options: FetchActionOptions = {},
): Promise<Response> {
    const url = new URL(request.url);
    const ticket = url.pathname.slice(ACTION_RESULT_PREFIX.length);
    const budget = options.actionPollAfterMs ?? 0;

    if (!ticket || !verifyTicket(ticket)) return resultNotFound();

    // The poll reapplies the original action's same-origin check (DL#234).
    const meta = peekTicketMeta(ticket);
    if (meta?.needsSameOriginCheck && isCrossOrigin(request, url)) {
        return jsonResponse(403, crossOriginErrorResponse(meta.actionName), new Headers(NO_STORE));
    }

    const from = Number(url.searchParams.get('from') ?? '0');
    const streamSegment = readStreamSegment(
        ticket,
        Number.isFinite(from) ? from : 0,
        budget,
        budget * 2,
    );
    if (streamSegment) {
        const name = meta?.actionName ?? 'stream';
        return segmentToResponse(name, streamSegment, new Headers(NO_STORE));
    }

    const outcome = await awaitTicket<ActionExecutionResult<unknown>>(ticket, budget);
    if (outcome.kind === 'unknown') return resultNotFound();
    if (outcome.kind === 'pending') {
        return jsonResponse(202, { pending: { ticket } }, new Headers(NO_STORE));
    }
    return deliverSettled(outcome.meta.actionName, outcome.settled, 'POST', registry, {}, true);
}

function resultNotFound(): Response {
    return jsonResponse(
        404,
        {
            success: false,
            error: {
                code: 'RESULT_NOT_FOUND',
                message: 'Action result is no longer available',
                isActionError: false,
            },
        },
        new Headers(NO_STORE),
    );
}

/** Unwraps a settled handler outcome (an ActionExecutionResult, or a defensive late rejection). */
function deliverSettled(
    actionName: string,
    settled: Settled<ActionExecutionResult<unknown>>,
    requestMethod: HttpMethod,
    registry: ActionRegistry,
    perUserHeaders: Record<string, string>,
    polled: boolean,
): Response {
    if (!settled.ok) {
        logActionFailure(actionName, 'polled handler rejected', settled.error);
        return jsonResponse(
            500,
            {
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: GENERIC_INTERNAL_MESSAGE,
                    isActionError: false,
                },
            },
            new Headers(polled ? NO_STORE : perUserHeaders),
        );
    }
    return deliverResult(
        actionName,
        settled.value,
        requestMethod,
        registry,
        perUserHeaders,
        polled,
    );
}

/** Writes a request/response ActionExecutionResult to a Response (today's success/error mapping). */
function deliverResult(
    actionName: string,
    result: ActionExecutionResult<unknown>,
    requestMethod: HttpMethod,
    registry: ActionRegistry,
    perUserHeaders: Record<string, string>,
    polled: boolean,
): Response {
    if (result.success) {
        const headers = new Headers(polled ? NO_STORE : perUserHeaders);
        if (!polled && requestMethod === 'GET') {
            const cacheHeaders = registry.getCacheHeaders(actionName);
            if (cacheHeaders) headers.set('Cache-Control', cacheHeaders);
        }
        for (const setCookie of result.setCookies ?? []) {
            headers.append('Set-Cookie', setCookie);
        }
        return jsonResponse(200, { success: true, data: result.data }, headers);
    }
    const statusCode = getStatusCodeForError(result.error.code, result.error.isActionError);
    return jsonResponse(
        statusCode,
        { success: false, error: redactInternalError(actionName, result.error, result.cause) },
        new Headers(polled ? NO_STORE : perUserHeaders),
    );
}

/** Today's direct NDJSON stream (no polling). */
function directStreamResponse(
    registry: ActionRegistry,
    actionName: string,
    input: unknown,
    incoming: IncomingRequest | undefined,
    perUserHeaders: Record<string, string>,
): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const generator = registry.executeStream(actionName, input, incoming);
                for await (const chunk of generator) {
                    controller.enqueue(encoder.encode(JSON.stringify({ chunk }) + '\n'));
                }
                controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + '\n'));
            } catch (err: any) {
                controller.enqueue(
                    encoder.encode(
                        JSON.stringify({ error: streamErrorMessage(actionName, err) }) + '\n',
                    ),
                );
            }
            controller.close();
        },
    });
    return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson', ...perUserHeaders },
    });
}

/**
 * The first NDJSON segment of a polled stream (DL#239): chunk lines, then resume/done/error. A
 * stream is POST-only and so was never cached — this keeps today's headers (no cache directive is
 * added just because the stream may be polled).
 */
function streamSegmentResponse(
    actionName: string,
    ticket: string,
    from: number,
    budget: number,
    perUserHeaders: Record<string, string>,
): Response {
    const segment = readStreamSegment(ticket, from, budget, budget * 2)!;
    return segmentToResponse(actionName, segment, new Headers(perUserHeaders));
}

function segmentToResponse(
    actionName: string,
    segment: AsyncIterable<StreamSegmentEvent<unknown>>,
    headers: Headers,
): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            for await (const event of segment) {
                controller.enqueue(encoder.encode(serializeSegmentEvent(actionName, event) + '\n'));
            }
            controller.close();
        },
    });
    headers.set('Content-Type', 'application/x-ndjson');
    return new Response(stream, { headers });
}

function serializeSegmentEvent(actionName: string, event: StreamSegmentEvent<unknown>): string {
    switch (event.kind) {
        case 'chunk':
            return JSON.stringify({ chunk: event.chunk });
        case 'done':
            return JSON.stringify({ done: true });
        case 'resume':
            return JSON.stringify({ resume: true });
        case 'error':
            return JSON.stringify({ error: streamErrorMessage(actionName, event.error) });
    }
}

/** Whether a valid `Content-Length` already exceeds the limit; invalid values are left to the streaming counter. */
function declaredLengthExceeds(request: Request, limitBytes: number): boolean {
    const declared = request.headers.get('content-length');
    if (declared === null || !/^\d+$/.test(declared.trim())) return false;
    return Number(declared) > limitBytes;
}

const BODY_TOO_LARGE = Symbol('body too large');

/** Reads the body as UTF-8, counting bytes; cancels the read as soon as the limit is crossed. */
async function readBodyWithinLimit(
    request: Request,
    limitBytes: number,
): Promise<string | typeof BODY_TOO_LARGE> {
    if (request.body === null) return '';
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > limitBytes) {
            await reader.cancel();
            return BODY_TOO_LARGE;
        }
        chunks.push(value);
    }
    return decodeUtf8(chunks, receivedBytes);
}

function decodeUtf8(chunks: Uint8Array[], totalBytes: number): string {
    const joined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(joined);
}

/** Replaces an INTERNAL_ERROR message with a generic one and logs the original (DL#234). */
function redactInternalError(
    actionName: string,
    error: ActionErrorResponse,
    cause: unknown,
): ActionErrorResponse {
    if (error.isActionError || error.code !== 'INTERNAL_ERROR') return error;
    logActionFailure(actionName, error.message, cause);
    return { ...error, message: GENERIC_INTERNAL_MESSAGE };
}

/** A streaming ActionError keeps its message; any other throw is logged and redacted (DL#234). */
function streamErrorMessage(actionName: string, err: unknown): string {
    const error = err as { name?: string; message?: string } | undefined;
    if (error?.name === 'ActionError') return String(error.message);
    logActionFailure(actionName, error?.message ?? String(err), err);
    return GENERIC_INTERNAL_MESSAGE;
}

function logActionFailure(actionName: string, message: string, cause: unknown): void {
    const stack = cause instanceof Error && cause.stack ? `\n${cause.stack}` : '';
    getLogger().error(`[Action] ${actionName} failed: ${message}${stack}`);
}

function isCrossOrigin(request: Request, url: URL): boolean {
    return isCrossOriginRequest({
        secFetchSite: request.headers.get('sec-fetch-site'),
        origin: request.headers.get('origin'),
        requestOrigin: url.origin,
    });
}

function readIncomingRequest(request: Request, url: URL): IncomingRequest {
    return {
        cookies: parseCookies(request.headers.get('cookie')),
        secure: isSecureRequest(url.protocol, request.headers.get('x-forwarded-proto')),
    };
}

function jsonResponse(
    status: number,
    body: object,
    extraHeaders: Headers = new Headers(),
): Response {
    extraHeaders.set('Content-Type', 'application/json');
    return new Response(JSON.stringify(body), { status, headers: extraHeaders });
}

export async function registerActionsFromManifest(
    actions: Array<{
        serverModule: string;
        isPlugin: boolean;
        actionNames: string[];
        packageName?: string;
    }>,
    buildDir: string,
    registry: ActionRegistry = actionRegistry,
): Promise<void> {
    const logger = getLogger();
    let count = 0;

    for (const entry of actions) {
        try {
            const modulePath = entry.isPlugin
                ? entry.packageName!
                : `${buildDir}/${entry.serverModule}`;
            const mod = await import(modulePath);

            for (const [, exported] of Object.entries(mod)) {
                if (isJayAction(exported)) {
                    registry.register(exported as any);
                    count++;
                } else if (isJayStreamAction(exported)) {
                    registry.registerStream(exported as any);
                    count++;
                }
            }
        } catch (err: any) {
            logger.error(
                `[Server] Failed to load action module ${entry.serverModule}: ${err.message}`,
            );
        }
    }

    logger.info(`[Server] Registered ${count} actions`);
}

/**
 * Register actions from pre-imported modules (DL#143).
 * Used by BaaS entry.mjs where action modules are bundled by esbuild.
 */
export async function registerActionsFromModules(
    modules: Array<{ module: Record<string, unknown>; name: string }>,
    registry: ActionRegistry = actionRegistry,
): Promise<void> {
    const logger = getLogger();
    let count = 0;

    for (const { module, name } of modules) {
        for (const [, exported] of Object.entries(module)) {
            if (isJayAction(exported)) {
                registry.register(exported as any);
                count++;
            } else if (isJayStreamAction(exported)) {
                registry.registerStream(exported as any);
                count++;
            }
        }
    }

    logger.info(`[Server] Registered ${count} actions from pre-imported modules`);
}

export function getStatusCodeForError(code: string, isActionError: boolean): number {
    if (isActionError) return 422;
    switch (code) {
        case 'ACTION_NOT_FOUND':
            return 404;
        case 'INVALID_INPUT':
        case 'VALIDATION_ERROR':
            return 400;
        case 'UNAUTHORIZED':
            return 401;
        case 'FORBIDDEN':
            return 403;
        case 'PAYLOAD_TOO_LARGE':
            return 413;
        default:
            return 500;
    }
}
