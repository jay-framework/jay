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
import { setClientInitData } from '@jay-framework/stack-server-runtime';

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
    logger.important(
        `[Server] Loaded manifest: ${manifest.routes.length} routes, v${manifest.version}`,
    );

    // Run plugin inits in dependency order
    const { discoverPluginsWithInit, sortPluginsByDependencies } = await import(
        '@jay-framework/stack-server-runtime'
    );
    try {
        const pluginsWithInit = sortPluginsByDependencies(
            await discoverPluginsWithInit({ projectRoot: process.cwd() }),
        );
        for (const pluginInit of pluginsWithInit) {
            try {
                let modulePath: string;
                if (pluginInit.isLocal) {
                    const pluginDirName = path.basename(pluginInit.pluginPath);
                    const initModule = pluginInit.initModule || 'index';
                    modulePath = path.join(buildDir, 'server', 'plugins', pluginDirName, initModule + '.js');
                } else {
                    modulePath = pluginInit.packageName;
                }
                const pluginModule = await import(modulePath);
                const init = pluginModule.init || pluginModule[pluginInit.initExport || 'init'];
                if (init?._serverInit) {
                    logger.info(`[Server] Running plugin init: ${pluginInit.name}`);
                    const data = await init._serverInit();
                    if (data) setClientInitData(pluginInit.name, data);
                }
            } catch (err: any) {
                logger.warn(`[Server] Plugin init failed: ${pluginInit.name}: ${err.message}`);
            }
        }
    } catch {
        // No plugins
    }

    // Run project init
    const initModule = await artifacts.loadPageModule('server/init.js').catch(() => null);
    if (initModule) {
        const init = initModule.init || initModule.default;
        if (init?._serverInit) {
            logger.important('[Server] Running server init...');
            const data = await init._serverInit();
            if (data) setClientInitData('project', data);
        }
    }

    // Register actions (project + plugin)
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
        logger.important(
            `[Server] Production server listening on http://localhost:${options.port}`,
        );
    });
}
