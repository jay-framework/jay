import http from 'node:http';
import { Readable } from 'node:stream';
import path from 'node:path';
import { getLogger } from '@jay-framework/logger';
import { FilesystemArtifactStore } from './artifact-store';
import { matchRequest } from './route-matcher';
import { fetchPageRequest } from './fetch-page-handler';
import {
    isActionRequest,
    fetchActionRequest,
    registerActionsFromManifest,
} from './fetch-action-handler';
import { fetchStaticFile } from './fetch-static-handler';
import { initializeServices } from '../shared/init-services';
import { parseCookies } from '@jay-framework/stack-server-runtime';

export interface MainServerOptions {
    buildRoot: string;
    version: number;
    port: number;
    publicBasePath?: string;
    serveStatic?: boolean;
    testMode?: boolean;
}

function toFetchRequest(req: http.IncomingMessage): Request {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const init: RequestInit = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = Readable.toWeb(req) as ReadableStream;
        (init as any).duplex = 'half';
    }
    return new Request(url, init);
}

async function pipeFetchResponse(response: Response, res: http.ServerResponse): Promise<void> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });
    res.writeHead(response.status, headers);

    if (response.body) {
        const reader = response.body.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
            }
        } finally {
            reader.releaseLock();
        }
    }
    res.end();
}

export async function startMainServer(options: MainServerOptions): Promise<void> {
    const logger = getLogger();
    const buildDir = path.join(options.buildRoot, `v${options.version}`);
    const backendDir = path.join(buildDir, 'backend');
    const frontendDir = path.join(buildDir, 'frontend');
    const artifacts = new FilesystemArtifactStore(backendDir);

    const manifest = await artifacts.readManifest();
    logger.important(
        `[Server] Loaded manifest: ${manifest.routes.length} routes, v${manifest.version}`,
    );

    await initializeServices(backendDir, process.cwd(), 'Server');

    if (manifest.actions.length > 0) {
        await registerActionsFromManifest(manifest.actions, backendDir);
    }

    const staticBaseUrl = options.publicBasePath ?? '/';
    const startTime = Date.now();

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        try {
            if (options.testMode && url.pathname === '/_jay/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(
                    JSON.stringify({
                        status: 'ready',
                        port: options.port,
                        uptime: (Date.now() - startTime) / 1000,
                    }),
                );
                return;
            }

            if (options.testMode && url.pathname === '/_jay/shutdown' && req.method === 'POST') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'shutting_down' }));
                setTimeout(() => {
                    server.close();
                    process.exit(0);
                }, 100);
                return;
            }

            if (isActionRequest(url.pathname)) {
                const fetchReq = toFetchRequest(req);
                const response = await fetchActionRequest(fetchReq);
                await pipeFetchResponse(response, res);
                return;
            }

            if (options.serveStatic !== false) {
                const staticResponse = await fetchStaticFile(url.pathname, frontendDir);
                if (staticResponse) {
                    await pipeFetchResponse(staticResponse, res);
                    return;
                }
            }

            const currentManifest = await artifacts.readManifest();
            const match = matchRequest(currentManifest, url.pathname);

            if (!match) {
                res.writeHead(404);
                res.end('Not Found');
                return;
            }

            const cookies = parseCookies(req.headers.cookie);
            const response = await fetchPageRequest(
                match,
                currentManifest,
                url,
                artifacts,
                staticBaseUrl,
                cookies,
            );
            await pipeFetchResponse(response, res);
        } catch (err: any) {
            logger.error(`[Server] Error handling ${url.pathname}: ${err.message}`);
            if (err.stack) logger.error(err.stack);
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
        }
    });

    server.listen(options.port, () => {
        logger.important(
            `[Server] Production server listening on http://localhost:${options.port}`,
        );
        if (options.testMode) {
            logger.important(`[Server] Test mode enabled`);
            logger.important(`   Health: http://localhost:${options.port}/_jay/health`);
            logger.important(
                `   Shutdown: curl -X POST http://localhost:${options.port}/_jay/shutdown`,
            );
        }
    });
}
