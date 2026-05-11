import type { IncomingMessage, ServerResponse } from 'node:http';
import { ActionRegistry, actionRegistry } from '@jay-framework/stack-server-runtime';
import { isJayAction, isJayStreamAction, type HttpMethod } from '@jay-framework/fullstack-component';
import { getLogger } from '@jay-framework/logger';

const ACTION_PREFIX = '/_jay/actions/';

export function isActionRequest(pathname: string): boolean {
    return pathname.startsWith(ACTION_PREFIX);
}

export async function handleActionRequest(
    req: IncomingMessage,
    res: ServerResponse,
    registry: ActionRegistry = actionRegistry,
): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const actionName = url.pathname.slice(ACTION_PREFIX.length);

    if (!actionName) {
        jsonResponse(res, 400, {
            success: false,
            error: { code: 'MISSING_ACTION_NAME', message: 'Action name is required', isActionError: false },
        });
        return;
    }

    const action = registry.get(actionName);
    if (!action) {
        jsonResponse(res, 404, {
            success: false,
            error: { code: 'ACTION_NOT_FOUND', message: `Action '${actionName}' is not registered`, isActionError: false },
        });
        return;
    }

    const requestMethod = (req.method || 'GET').toUpperCase() as HttpMethod;
    if (requestMethod !== action.method) {
        jsonResponse(res, 405, {
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: `Action '${actionName}' expects ${action.method}, got ${requestMethod}`, isActionError: false },
        });
        return;
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
            input = await parseBody(req);
        }
    } catch {
        jsonResponse(res, 400, {
            success: false,
            error: { code: 'INVALID_INPUT', message: 'Failed to parse request input', isActionError: false },
        });
        return;
    }

    if (registry.isStreaming(actionName)) {
        res.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Transfer-Encoding': 'chunked',
        });
        try {
            const generator = registry.executeStream(actionName, input);
            for await (const chunk of generator) {
                res.write(JSON.stringify({ chunk }) + '\n');
            }
            res.write(JSON.stringify({ done: true }) + '\n');
        } catch (err: any) {
            res.write(JSON.stringify({ error: err.message }) + '\n');
        }
        res.end();
        return;
    }

    const result = await registry.execute(actionName, input);

    if (result.success) {
        if (requestMethod === 'GET') {
            const cacheHeaders = registry.getCacheHeaders(actionName);
            if (cacheHeaders) {
                res.setHeader('Cache-Control', cacheHeaders);
            }
        }
        jsonResponse(res, 200, { success: true, data: result.data });
    } else {
        const statusCode = getStatusCode(result.error.code, result.error.isActionError);
        jsonResponse(res, statusCode, { success: false, error: result.error });
    }
}

export async function registerActionsFromManifest(
    actions: Array<{ serverModule: string; isPlugin: boolean; actionNames: string[]; packageName?: string }>,
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
            logger.error(`[Server] Failed to load action module ${entry.serverModule}: ${err.message}`);
        }
    }

    logger.info(`[Server] Registered ${count} actions`);
}

function jsonResponse(res: ServerResponse, status: number, body: object): void {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
}

function parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            if (!raw) { resolve({}); return; }
            try { resolve(JSON.parse(raw)); }
            catch { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

function getStatusCode(code: string, isActionError: boolean): number {
    if (isActionError) return 422;
    switch (code) {
        case 'ACTION_NOT_FOUND': return 404;
        case 'INVALID_INPUT':
        case 'VALIDATION_ERROR': return 400;
        case 'UNAUTHORIZED': return 401;
        case 'FORBIDDEN': return 403;
        default: return 500;
    }
}
