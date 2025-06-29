import express, { Express } from 'express';
import { mkDevServer } from '@jay-framework/dev-server';
import path from 'path';

// Constants
const port = process.env.PORT || 5173;
const base = process.env.BASE || '/';

const jayOptions = {
    tsConfigFilePath: './tsconfig.json',
    outputDir: 'build/jay-runtime',
};

// Create http server
const app: Express = express();

async function initApp() {
    const { server, viteServer, routes } = await mkDevServer({
        pagesBase: path.resolve('./src/pages'),
        serverBase: base,
        dontCacheSlowly: false,
        jayRollupConfig: jayOptions,
    });

    app.use(server);

    // Serve HTML
    routes.forEach((route) => {
        app.get(route.path, route.handler);
    });

    // Start http server
    app.listen(port, () => {
        console.log(`Server started at http://localhost:${port}`);
    });
}

initApp();
