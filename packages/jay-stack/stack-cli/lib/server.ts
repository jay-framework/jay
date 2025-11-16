import express, { Express } from 'express';
import { mkDevServer } from '@jay-framework/dev-server';
import { createEditorServer } from '@jay-framework/editor-server';
import getPort from 'get-port';
import path from 'path';
import fs from 'fs';
import { loadConfig, updateConfig, getConfigWithDefaults } from './config';
import { createEditorHandlers } from './editor-handlers';
import { generatePageDefinitionFiles } from './generate-page-definition-files';

// Load configuration
const config = loadConfig();
const resolvedConfig = getConfigWithDefaults(config);

const jayOptions = {
    tsConfigFilePath: './tsconfig.json',
    outputDir: 'build/jay-runtime',
};

// Create http server
const app: Express = express();

async function initApp() {
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
    const handlers = createEditorHandlers(resolvedConfig, jayOptions.tsConfigFilePath);
    editorServer.onPublish(handlers.onPublish);
    editorServer.onSaveImage(handlers.onSaveImage);
    editorServer.onHasImage(handlers.onHasImage);

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
    generatePageDefinitionFiles(routes, jayOptions.tsConfigFilePath);

    // Start http server
    const expressServer = app.listen(devServerPort, () => {
        console.log(`🚀 Jay Stack dev server started successfully!`);
        console.log(`📱 Dev Server: http://localhost:${devServerPort}`);
        console.log(`🎨 Editor Server: http://localhost:${editorPort} (ID: ${editorId})`);
        console.log(`📁 Pages directory: ${resolvedConfig.devServer.pagesBase}`);
        if (fs.existsSync(publicPath)) {
            console.log(`📁 Public folder: ${resolvedConfig.devServer.publicFolder}`);
        }
    });

    const shutdown = async () => {
        console.log('\n🛑 Shutting down servers...');
        await editorServer.stop();
        expressServer.closeAllConnections();
        await new Promise((resolve) => expressServer.close(resolve));
        process.exit(0);
    };
    // Handle graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

initApp().catch((error) => {
    console.error('Failed to start servers:', error);
    process.exit(1);
});
