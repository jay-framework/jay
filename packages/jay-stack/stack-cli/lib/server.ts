import express, { Express } from 'express';
import { mkDevServer } from '@jay-framework/dev-server';
import { createEditorServer } from '@jay-framework/editor-server';
import getPort from 'get-port';
import path from 'path';
import { loadConfig } from './config';

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
        onEditorId: (editorId) => {
            console.log(`Editor connected with ID: ${editorId}`);
        },
    });

    const { port: editorPort, editorId } = await editorServer.start();

    // Start dev server
    const { server, viteServer, routes } = await mkDevServer({
        pagesBase: path.resolve('./src/pages'),
        serverBase: '/',
        dontCacheSlowly: false,
        jayRollupConfig: jayOptions,
    });

    app.use(server);

    // Serve HTML
    routes.forEach((route) => {
        app.get(route.path, route.handler);
    });

    // Start http server
    app.listen(devServerPort, () => {
        console.log(`🚀 Jay Stack CLI started successfully!`);
        console.log(`📱 Dev Server: http://localhost:${devServerPort}`);
        console.log(`🎨 Editor Server: http://localhost:${editorPort} (ID: ${editorId})`);
        console.log(`📁 Pages directory: ./src/pages`);
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down servers...');
        await editorServer.stop();
        process.exit(0);
    });
}

initApp().catch((error) => {
    console.error('Failed to start servers:', error);
    process.exit(1);
});
