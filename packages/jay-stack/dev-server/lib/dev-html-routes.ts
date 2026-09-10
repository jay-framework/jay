/**
 * Dev-only raw HTML routes (DL#53 scratch preview transport).
 *
 * Plugins register handlers before DevServerService exists; routes flush on service creation.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';
import { getLogger } from '@jay-framework/logger';
import type { DevServerService } from './dev-server-service.js';

export type DevHtmlRouteHandler = (
    req: IncomingMessage,
    res: ServerResponse,
    url: string,
) => void | Promise<void>;

type DevHtmlRoute = {
    path: string;
    handler: DevHtmlRouteHandler;
};

const pendingRoutes: DevHtmlRoute[] = [];

/** Register a dev-only GET handler. Safe to call from plugin server init before mkDevServer finishes. */
export function registerDevHtmlRoute(path: string, handler: DevHtmlRouteHandler): void {
    pendingRoutes.push({ path, handler });
}

export function flushPendingDevHtmlRoutes(service: DevServerService): void {
    for (const route of pendingRoutes) {
        service.registerDevHtmlRoute(route.path, route.handler);
    }
    pendingRoutes.length = 0;
}

export function setupDevHtmlRoutesMiddleware(
    vite: ViteDevServer,
    service: DevServerService,
): void {
    vite.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            next();
            return;
        }

        const url = req.url ?? '';
        const pathname = url.split('?')[0] ?? '';
        const handler = service.getDevHtmlRoute(pathname);
        if (!handler) {
            next();
            return;
        }

        try {
            await handler(req, res, url);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            getLogger().warn(`[DevHtmlRoute] ${pathname}: ${message}`);
            if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.end('Internal Server Error');
            }
        }
    });
}
