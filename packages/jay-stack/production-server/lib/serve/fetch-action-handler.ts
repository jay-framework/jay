import {
    ActionRegistry,
    actionRegistry,
    crossOriginErrorResponse,
    isCrossOriginRequest,
    isSecureRequest,
    needsSameOriginCheck,
    parseCookies,
    type IncomingRequest,
} from '@jay-framework/stack-server-runtime';
import {
    isJayAction,
    isJayStreamAction,
    type HttpMethod,
} from '@jay-framework/fullstack-component';
import { getLogger } from '@jay-framework/logger';

const ACTION_PREFIX = '/_jay/actions/';

export function isActionRequest(pathname: string): boolean {
    return pathname.startsWith(ACTION_PREFIX);
}

export async function fetchActionRequest(
    request: Request,
    registry: ActionRegistry = actionRegistry,
): Promise<Response> {
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
            const text = await request.text();
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

    if (registry.isStreaming(actionName)) {
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
                        encoder.encode(JSON.stringify({ error: err.message }) + '\n'),
                    );
                }
                controller.close();
            },
        });
        return new Response(stream, {
            headers: { 'Content-Type': 'application/x-ndjson', ...perUserHeaders },
        });
    }

    const result = await registry.execute(actionName, input, incoming);

    if (result.success) {
        const headers = new Headers(perUserHeaders);
        if (requestMethod === 'GET') {
            const cacheHeaders = registry.getCacheHeaders(actionName);
            if (cacheHeaders) {
                headers.set('Cache-Control', cacheHeaders);
            }
        }
        for (const setCookie of result.setCookies ?? []) {
            headers.append('Set-Cookie', setCookie);
        }
        return jsonResponse(200, { success: true, data: result.data }, headers);
    } else {
        const statusCode = getStatusCode(result.error.code, result.error.isActionError);
        return jsonResponse(
            statusCode,
            { success: false, error: result.error },
            new Headers(perUserHeaders),
        );
    }
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

function getStatusCode(code: string, isActionError: boolean): number {
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
        default:
            return 500;
    }
}
