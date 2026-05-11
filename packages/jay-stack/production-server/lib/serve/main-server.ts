import http from 'node:http';
import path from 'node:path';
import { getLogger } from '@jay-framework/logger';
import { FilesystemArtifactStore } from './artifact-store';
import { matchRequest } from './route-matcher';
import { handlePageRequest } from './page-handler';
import { handleStaticRequest } from './static-handler';
import { isActionRequest, handleActionRequest, registerActionsFromManifest } from './action-handler';

export interface MainServerOptions {
    buildRoot: string;
    version: number;
    port: number;
    publicBasePath: string;
}

export async function startMainServer(options: MainServerOptions): Promise<void> {
    const logger = getLogger();
    const buildDir = path.join(options.buildRoot, `v${options.version}`);
    const artifacts = new FilesystemArtifactStore(buildDir);

    const manifest = await artifacts.readManifest();
    logger.important(`[Server] Loaded manifest: ${manifest.routes.length} routes, v${manifest.version}`);

    const initModule = await artifacts.loadPageModule('server/init.js').catch(() => null);
    if (initModule) {
        const init = initModule.init || initModule.default;
        if (init?._serverInit) {
            logger.important('[Server] Running server init...');
            await init._serverInit();
        }
    }

    if (manifest.actions.length > 0) {
        await registerActionsFromManifest(manifest.actions, buildDir);
    }

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        try {
            if (isActionRequest(url.pathname)) {
                await handleActionRequest(req, res);
                return;
            }

            const handled = await handleStaticRequest(req, res, path.join(buildDir, 'shared'), '/shared/');
            if (handled) return;

            const handledInstances = await handleStaticRequest(req, res, path.join(buildDir, 'instances'), '/instances/');
            if (handledInstances) return;

            const currentManifest = await artifacts.readManifest();
            const match = matchRequest(currentManifest, url.pathname);

            if (!match) {
                res.writeHead(404);
                res.end('Not Found');
                return;
            }

            await handlePageRequest(res, match, currentManifest, artifacts);
        } catch (err: any) {
            logger.error(`[Server] Error handling ${url.pathname}: ${err.message}`);
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
        }
    });

    server.listen(options.port, () => {
        logger.important(`[Server] Production server listening on http://localhost:${options.port}`);
    });
}
