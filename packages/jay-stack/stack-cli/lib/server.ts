import express, { Express } from 'express';
import http from 'node:http';
import { mkDevServer } from '@jay-framework/dev-server';
import { createEditorServer } from '@jay-framework/editor-server';
import getPort from 'get-port';
import path from 'path';
import fs from 'fs';
import { loadConfig, updateConfig, getConfigWithDefaults } from './config';
import { createEditorHandlers } from './editor-handlers';
import { generatePageDefinitionFiles } from './generate-page-definition-files';
import { getLogger, type LogLevel } from '@jay-framework/logger';
import { getRegisteredVendors } from './vendors';

export interface StartDevServerOptions {
    projectPath?: string;
    /** Enable test endpoints (/_jay/health, /_jay/shutdown) */
    testMode?: boolean;
    /** Auto-shutdown after N seconds */
    timeout?: number;
    /** Log level for output */
    logLevel?: LogLevel;
}

export async function startDevServer(options: StartDevServerOptions = {}) {
    const projectPath = options.projectPath || process.cwd();

    // Change to project directory if specified
    if (projectPath !== process.cwd()) {
        process.chdir(projectPath);
    }

    // Load configuration
    const config = loadConfig();
    const resolvedConfig = getConfigWithDefaults(config);

    const jayOptions = {
        tsConfigFilePath: './tsconfig.json',
        outputDir: 'build',
    };

    // Create http server
    const app: Express = express();
    const httpServer = http.createServer(app);
    // Find available port for dev server
    const devServerPort = await getPort({ port: resolvedConfig.devServer.portRange });

    // Start editor server
    const log = getLogger();

    const editorServer = createEditorServer({
        portRange: resolvedConfig.editorServer.portRange,
        editorId: resolvedConfig.editorServer.editorId,
        onEditorId: (editorId) => {
            log.info(`Editor connected with ID: ${editorId}`);
            // Update the .jay config file with the editor ID
            updateConfig({
                editorServer: {
                    editorId: editorId,
                },
            });
        },
    });

    const { port: editorPort, editorId } = await editorServer.start();

    // Log registered vendors
    const registeredVendors = getRegisteredVendors();
    if (registeredVendors.length > 0) {
        log.info(
            `📦 Registered ${registeredVendors.length} vendor(s): ${registeredVendors.join(', ')}`,
        );
    }

    // Set up editor server callbacks
    const handlers = createEditorHandlers(
        resolvedConfig,
        jayOptions.tsConfigFilePath,
        process.cwd(),
    );
    editorServer.onPublish(handlers.onPublish);
    editorServer.onSaveImage(handlers.onSaveImage);
    editorServer.onHasImage(handlers.onHasImage);
    editorServer.onGetProjectInfo(handlers.onGetProjectInfo);
    editorServer.onExport(handlers.onExport);
    editorServer.onImport(handlers.onImport);

    // Start dev server — pass httpServer so Vite's HMR WebSocket piggybacks
    // on Express's port instead of binding to the default port 24678
    const { server, viteServer, routes, service } = await mkDevServer({
        pagesRootFolder: path.resolve(resolvedConfig.devServer.pagesBase),
        projectRootFolder: process.cwd(),
        publicBaseUrlPath: '/',
        jayRollupConfig: jayOptions,
        logLevel: options.logLevel,
        httpServer,
    });

    app.use(server);

    // Wire editor protocol handlers to DevServerService (DL#128)
    const { freezeStore } = service;

    editorServer.onListRoutes(async () => ({
        type: 'listRoutes' as const,
        success: true,
        routes: service.listRoutes(),
    }));

    if (freezeStore) {
        editorServer.onListFreezes(async (params) => ({
            type: 'listFreezes' as const,
            success: true,
            freezes: (await freezeStore.list(params.route)).map(
                ({ id, name, route, createdAt }) => ({ id, name, route, createdAt }),
            ),
        }));
        editorServer.onRenameFreeze(async (params) => ({
            type: 'renameFreeze' as const,
            success: await freezeStore.rename(params.id, params.name),
        }));
        editorServer.onDeleteFreeze(async (params) => ({
            type: 'deleteFreeze' as const,
            success: await freezeStore.delete(params.id),
        }));

        // Emit freezeChanged when jay-html or CSS changes
        viteServer.watcher.on('change', (changedPath) => {
            if (changedPath.endsWith('.jay-html') || changedPath.endsWith('.css')) {
                editorServer.emitFreezeChanged();
            }
        });
    }

    // Route params discovery — delegates to DevServerService generator
    editorServer.onLoadRouteParams(async (params) => {
        const routePath = params.route;
        try {
            // Stream batches asynchronously, respond immediately
            (async () => {
                try {
                    for await (const batch of service.loadRouteParams(routePath)) {
                        editorServer.emitRouteParamsBatch({
                            type: 'routeParamsBatch',
                            route: routePath,
                            params: batch,
                            hasMore: true,
                        });
                    }
                    editorServer.emitRouteParamsBatch({
                        type: 'routeParamsBatch',
                        route: routePath,
                        params: [],
                        hasMore: false,
                    });
                } catch (err: any) {
                    editorServer.emitRouteParamsBatch({
                        type: 'routeParamsBatch',
                        route: routePath,
                        params: [],
                        hasMore: false,
                    });
                }
            })();
            return { type: 'loadRouteParams' as const, success: true };
        } catch (err: any) {
            return { type: 'loadRouteParams' as const, success: false, error: err.message };
        }
    });

    // Serve static files from public folder
    const publicPath = path.resolve(resolvedConfig.devServer.publicFolder);
    if (fs.existsSync(publicPath)) {
        app.use(express.static(publicPath));
    } else {
        log.important(`⚠️  Public folder not found: ${resolvedConfig.devServer.publicFolder}`);
    }

    // Serve HTML
    routes.forEach((route) => {
        app.get(route.path, route.handler);
    });

    // generate page d.ts files
    generatePageDefinitionFiles(routes, jayOptions.tsConfigFilePath, process.cwd());

    // Start http server (HMR WebSocket is attached to this server)
    httpServer.listen(devServerPort, () => {
        log.important(`🚀 Jay Stack dev server started successfully!`);
        log.important(`📱 Dev Server: http://localhost:${devServerPort}`);
        log.important(`🎨 Editor Server: http://localhost:${editorPort} (ID: ${editorId})`);
        log.important(`📁 Pages directory: ${resolvedConfig.devServer.pagesBase}`);
        if (fs.existsSync(publicPath)) {
            log.important(`📁 Public folder: ${resolvedConfig.devServer.publicFolder}`);
        }
        // Test mode info
        if (options.testMode) {
            log.important(`🧪 Test Mode: enabled`);
            log.important(`   Health: http://localhost:${devServerPort}/_jay/health`);
            log.important(
                `   Shutdown: curl -X POST http://localhost:${devServerPort}/_jay/shutdown`,
            );
            if (options.timeout) {
                log.important(`   Timeout: ${options.timeout}s`);
            }
        }
    });

    // Shutdown function
    const shutdown = async () => {
        log.important('\n🛑 Shutting down servers...');
        await editorServer.stop();
        httpServer.closeAllConnections();
        await new Promise((resolve) => httpServer.close(resolve));
        process.exit(0);
    };

    // Test mode endpoints (for smoke tests and CI)
    if (options.testMode) {
        // Health check endpoint
        app.get('/_jay/health', (_req, res) => {
            res.json({
                status: 'ready',
                port: devServerPort,
                editorPort,
                uptime: process.uptime(),
            });
        });

        // Shutdown endpoint
        app.post('/_jay/shutdown', async (_req, res) => {
            res.json({ status: 'shutting_down' });
            // Give response time to be sent
            setTimeout(async () => {
                await shutdown();
            }, 100);
        });

        // Auto-shutdown timeout
        if (options.timeout) {
            setTimeout(async () => {
                log.important(`\n⏰ Timeout (${options.timeout}s) reached, shutting down...`);
                await shutdown();
            }, options.timeout * 1000);
        }
    }

    // Handle graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
