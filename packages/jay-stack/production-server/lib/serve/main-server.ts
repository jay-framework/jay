import http from 'node:http';
import path from 'node:path';
import { getLogger } from '@jay-framework/logger';
import { FilesystemArtifactStore } from './artifact-store';
import { matchRequest } from './route-matcher';
import { handlePageRequest } from './page-handler';
import { handleStaticRequest } from './static-handler';
import {
    isActionRequest,
    handleActionRequest,
    registerActionsFromManifest,
} from './action-handler';
import { initializeServices } from '../shared/init-services';

export interface MainServerOptions {
    buildRoot: string;
    version: number;
    port: number;
    publicBasePath: string;
    testMode?: boolean;
}

export async function startMainServer(options: MainServerOptions): Promise<void> {
    const logger = getLogger();
    const buildDir = path.join(options.buildRoot, `v${options.version}`);
    const artifacts = new FilesystemArtifactStore(buildDir);

    const manifest = await artifacts.readManifest();
    logger.important(
        `[Server] Loaded manifest: ${manifest.routes.length} routes, v${manifest.version}`,
    );

    await initializeServices(buildDir, process.cwd(), 'Server');

    // Register actions (project + plugin)
    if (manifest.actions.length > 0) {
        await registerActionsFromManifest(manifest.actions, buildDir);
    }

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
                await handleActionRequest(req, res);
                return;
            }

            const handled = await handleStaticRequest(
                req,
                res,
                path.join(buildDir, 'shared'),
                '/shared/',
            );
            if (handled) return;

            const handledInstances = await handleStaticRequest(
                req,
                res,
                path.join(buildDir, 'pre-rendered'),
                '/pre-rendered/',
            );
            if (handledInstances) return;

            const currentManifest = await artifacts.readManifest();
            const match = matchRequest(currentManifest, url.pathname);

            if (!match) {
                res.writeHead(404);
                res.end('Not Found');
                return;
            }

            await handlePageRequest(res, match, currentManifest, url, artifacts);
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
