import express, { Express } from 'express';
import { mkDevServer } from '@jay-framework/dev-server';
import { createEditorServer } from '@jay-framework/editor-server';
import getPort from 'get-port';
import path from 'path';
import fs from 'fs';
import { loadConfig, updateConfig } from './config';

// Load configuration
const config = loadConfig();

const jayOptions = {
    tsConfigFilePath: './tsconfig.json',
    outputDir: 'build/jay-runtime',
};

// Create http server
const app: Express = express();

async function initApp() {
    // Find available port for dev server
    const devServerPort = await getPort({ port: config.devServer?.portRange || [3000, 3100] });

    // Start editor server
    const editorServer = createEditorServer({
        portRange: config.editorServer?.portRange || [3101, 3200],
        editorId: config.editorServer?.editorId,
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

    // Start dev server
    const pagesBase = config.devServer?.pagesBase || './src/pages';
    const { server, viteServer, routes } = await mkDevServer({
        pagesBase: path.resolve(pagesBase),
        serverBase: '/',
        dontCacheSlowly: false,
        jayRollupConfig: jayOptions,
    });

    app.use(server);

    // Serve static files from public folder
    const publicFolder = config.devServer?.publicFolder || './public';
    const publicPath = path.resolve(publicFolder);
    if (fs.existsSync(publicPath)) {
        app.use(express.static(publicPath));
    } else {
        console.log(`⚠️  Public folder not found: ${publicFolder}`);
    }

    // Serve HTML
    routes.forEach((route) => {
        app.get(route.path, route.handler);
    });

    // Start http server
    const expressServer = app.listen(devServerPort, () => {
        console.log(`🚀 Jay Stack dev server started successfully!`);
        console.log(`📱 Dev Server: http://localhost:${devServerPort}`);
        console.log(`🎨 Editor Server: http://localhost:${editorPort} (ID: ${editorId})`);
        console.log(`📁 Pages directory: ${pagesBase}`);
        if (fs.existsSync(publicPath)) {
            console.log(`📁 Public folder: ${publicFolder}`);
        }
    });

    const shutdown = async () => {
        console.log('\n🛑 Shutting down servers...');
        await editorServer.stop();
        expressServer.closeAllConnections();
        await new Promise(resolve => expressServer.close(resolve));
        process.exit(0);
    }
    // Handle graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

initApp().catch((error) => {
    console.error('Failed to start servers:', error);
    process.exit(1);
});
