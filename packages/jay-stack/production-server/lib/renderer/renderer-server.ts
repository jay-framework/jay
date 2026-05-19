import http from 'node:http';
import path from 'node:path';
import { getLogger } from '@jay-framework/logger';
import { discoverWebhooks, type DiscoveredWebhook } from './webhook-discovery';
import { initializeServices } from '../shared/init-services';
import { rebuildContract } from '../invalidation';
import type { InvalidateContract, WebhookEvent } from '@jay-framework/fullstack-component';
import type { RouteManifest } from '../types';
import fs from 'node:fs/promises';

export interface RendererServerOptions {
    buildRoot: string;
    version: number;
    port: number;
    projectRoot: string;
    pagesRoot: string;
    tsConfigFilePath?: string;
    minify?: boolean;
}

export async function startRendererServer(options: RendererServerOptions): Promise<void> {
    const logger = getLogger();
    const buildDir = path.join(options.buildRoot, `v${options.version}`);
    const serverBuildDir = path.join(buildDir, 'server');

    logger.important(`[Renderer] Starting renderer server v${options.version}`);

    await initializeServices(buildDir, options.projectRoot, 'Renderer');

    // Discover webhooks
    const webhooks = await discoverWebhooks(options.projectRoot, serverBuildDir);
    const webhookMap = new Map<string, DiscoveredWebhook>();
    for (const wh of webhooks) {
        webhookMap.set(wh.name, wh);
    }

    logger.important(
        `[Renderer] ${webhookMap.size} webhook(s) registered: ${[...webhookMap.keys()].join(', ') || 'none'}`,
    );

    // Build the invalidate function
    const createInvalidateForWebhook = (): InvalidateContract => {
        return async (contractName: string, params?: Record<string, string>) => {
            await rebuildContract({
                projectRoot: options.projectRoot,
                pagesRoot: options.pagesRoot,
                buildRoot: options.buildRoot,
                version: options.version,
                contractName,
                params,
                tsConfigFilePath: options.tsConfigFilePath,
                minify: options.minify,
            });
        };
    };

    // Server state
    const startTime = Date.now();
    let lastWebhook: { name: string; timestamp: string } | undefined;

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        try {
            // POST /_jay/webhooks/:webhookName
            const webhookMatch = url.pathname.match(/^\/_jay\/webhooks\/(.+)$/);
            if (webhookMatch && req.method === 'POST') {
                const webhookName = webhookMatch[1];
                const discovered = webhookMap.get(webhookName);

                if (!discovered) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Unknown webhook: ${webhookName}` }));
                    return;
                }

                const body = await readBody(req);
                const event: WebhookEvent = {
                    type: webhookName,
                    payload: JSON.parse(body || '{}'),
                    headers: req.headers as Record<string, string>,
                };

                const invalidate = createInvalidateForWebhook();

                // Resolve services for webhook handler
                const resolver = globalThis.__JAY_SERVICE_RESOLVER__;
                const services = resolver ? resolver(discovered.webhook.services as any[]) : [];

                await discovered.webhook.handler(event, invalidate, ...services);

                lastWebhook = { name: webhookName, timestamp: new Date().toISOString() };

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            // POST /_jay/rebuild
            if (url.pathname === '/_jay/rebuild' && req.method === 'POST') {
                const body = JSON.parse((await readBody(req)) || '{}');
                const { contract, params } = body;

                if (!contract) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing "contract" field' }));
                    return;
                }

                const result = await rebuildContract({
                    projectRoot: options.projectRoot,
                    pagesRoot: options.pagesRoot,
                    buildRoot: options.buildRoot,
                    version: options.version,
                    contractName: contract,
                    params,
                    tsConfigFilePath: options.tsConfigFilePath,
                    minify: options.minify,
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }

            // GET /_jay/status
            if (url.pathname === '/_jay/status' && req.method === 'GET') {
                const manifest: RouteManifest = JSON.parse(
                    await fs.readFile(path.join(buildDir, 'route-manifest.json'), 'utf-8'),
                );
                const status = {
                    version: options.version,
                    buildTimestamp: manifest.buildTimestamp,
                    instanceCount: manifest.routes.reduce((n, r) => n + r.instances.length, 0),
                    uptime: Math.floor((Date.now() - startTime) / 1000),
                    webhooks: [...webhookMap.keys()],
                    lastWebhook,
                };

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(status, null, 2));
                return;
            }

            res.writeHead(404);
            res.end('Not Found');
        } catch (err: any) {
            logger.error(`[Renderer] Error: ${err.message}`);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        }
    });

    server.listen(options.port, () => {
        logger.important(
            `[Renderer] Renderer server listening on http://localhost:${options.port}`,
        );
    });
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
        req.on('error', reject);
    });
}
