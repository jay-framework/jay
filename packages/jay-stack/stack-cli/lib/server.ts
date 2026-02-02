import express, { Express } from 'express';
import { mkDevServer } from '@jay-framework/dev-server';
import { createEditorServer } from '@jay-framework/editor-server';
import getPort from 'get-port';
import path from 'path';
import fs from 'fs';
import { loadConfig, updateConfig, getConfigWithDefaults } from './config';
import { createEditorHandlers } from './editor-handlers';
import { generatePageDefinitionFiles } from './generate-page-definition-files';

export interface StartDevServerOptions {
    projectPath?: string;
    /** Enable test endpoints (/_jay/health, /_jay/shutdown) */
    testMode?: boolean;
    /** Auto-shutdown after N seconds */
    timeout?: number;
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
        outputDir: 'build/jay-runtime',
    };

    // Create http server
    const app: Express = express();
    // Find available port for dev server
    const devServerPort = await getPort({ port: resolvedConfig.devServer.portRange });

    // Start editor server
    const editorServer = createEditorServer({
        portRange: resolvedConfig.editorServer.portRange,
        editorId: resolvedConfig.editorServer.editorId,
        onEditorId: (editorId) => {
            console.log(`Editor connected with ID: ${editorId}`);
            // Update the .jay config file with the editor ID
            updateConfig({
                editorServer: {
                    editorId: editorId,
                },
            });
        },
    });

    const { port: editorPort, editorId } = await editorServer.start();

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

    // Start dev server
    const { server, viteServer, routes } = await mkDevServer({
        pagesRootFolder: path.resolve(resolvedConfig.devServer.pagesBase),
        projectRootFolder: process.cwd(),
        publicBaseUrlPath: '/',
        dontCacheSlowly: false,
        jayRollupConfig: jayOptions,
    });

    app.use(server);

    // Serve static files from public folder
    const publicPath = path.resolve(resolvedConfig.devServer.publicFolder);
    if (fs.existsSync(publicPath)) {
        app.use(express.static(publicPath));
    } else {
        console.log(`⚠️  Public folder not found: ${resolvedConfig.devServer.publicFolder}`);
    }

    // Serve HTML
    routes.forEach((route) => {
        app.get(route.path, route.handler);
    });

    // generate page d.ts files
    generatePageDefinitionFiles(routes, jayOptions.tsConfigFilePath, process.cwd());

    // Start http server
    const expressServer = app.listen(devServerPort, () => {
        console.log(`🚀 Jay Stack dev server started successfully!`);
        console.log(`📱 Dev Server: http://localhost:${devServerPort}`);
        console.log(`🎨 Editor Server: http://localhost:${editorPort} (ID: ${editorId})`);
        console.log(`📁 Pages directory: ${resolvedConfig.devServer.pagesBase}`);
        if (fs.existsSync(publicPath)) {
            console.log(`📁 Public folder: ${resolvedConfig.devServer.publicFolder}`);
        }
        // Test mode info
        if (options.testMode) {
            console.log(`🧪 Test Mode: enabled`);
            console.log(`   Health: http://localhost:${devServerPort}/_jay/health`);
            console.log(`   Shutdown: curl -X POST http://localhost:${devServerPort}/_jay/shutdown`);
            if (options.timeout) {
                console.log(`   Timeout: ${options.timeout}s`);
            }
        }
    });

    // Shutdown function
    const shutdown = async () => {
        console.log('\n🛑 Shutting down servers...');
        await editorServer.stop();
        expressServer.closeAllConnections();
        await new Promise((resolve) => expressServer.close(resolve));
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
                console.log(`\n⏰ Timeout (${options.timeout}s) reached, shutting down...`);
                await shutdown();
            }, options.timeout * 1000);
        }
    }

    // Handle graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
