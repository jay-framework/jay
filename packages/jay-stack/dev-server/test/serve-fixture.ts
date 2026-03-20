/**
 * Starts a dev server for a fixture page, for manual debugging.
 *
 * Usage:
 *   npx tsx test/serve-fixture.ts <fixture-name>
 *
 * Examples:
 *   npx tsx test/serve-fixture.ts page-headless-static
 *   npx tsx test/serve-fixture.ts page-headless-conditional
 *   npx tsx test/serve-fixture.ts page-headless-foreach
 *   npx tsx test/serve-fixture.ts page-headless-slow-foreach
 *   npx tsx test/serve-fixture.ts page-static-only
 *   npx tsx test/serve-fixture.ts page-dynamic-text
 *   npx tsx test/serve-fixture.ts page-conditional
 *   npx tsx test/serve-fixture.ts page-foreach
 *   npx tsx test/serve-fixture.ts page-slow-foreach
 *
 * Opens on http://localhost:3333 (or next available port).
 * Press Ctrl+C to stop.
 */

import { mkDevServer } from '../lib';
import type { JayRollupConfig } from '@jay-framework/vite-plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureName = process.argv[2];

if (!fixtureName) {
    console.error('Usage: npx tsx test/serve-fixture.ts <fixture-name>');
    console.error('');
    console.error('Available fixtures:');
    const fixtures = [
        'page-static-only',
        'page-dynamic-text',
        'page-conditional',
        'page-foreach',
        'page-slow-foreach',
        'page-headless-static',
        'page-headless-conditional',
        'page-headless-foreach',
        'page-headless-slow-foreach',
    ];
    fixtures.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
}

const dirPath = path.resolve(__dirname, fixtureName);

async function start() {
    console.log(`Starting dev server for fixture: ${fixtureName}`);
    console.log(`Directory: ${dirPath}`);

    const devServer = await mkDevServer({
        pagesRootFolder: dirPath,
        projectRootFolder: dirPath,
        jayRollupConfig: {
            tsConfigFilePath: path.join(dirPath, 'tsconfig.json'),
        } as JayRollupConfig,
        dontCacheSlowly: false,
    });

    const app = express();

    // Mount page routes first (SSR handlers)
    for (const route of devServer.routes) {
        console.log(`  Route: ${route.path}`);
        app.get(route.path, route.handler);
    }

    // Then Vite middleware (serves client scripts, HMR, etc.)
    app.use(devServer.viteServer.middlewares);

    const PORT = 3333;
    const httpServer = app.listen(PORT, () => {
        console.log('');
        console.log(`  Dev Server: http://localhost:${PORT}`);
        console.log(`  Fixture: ${fixtureName}`);
        console.log('');
        console.log('  Press Ctrl+C to stop.');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        httpServer.close();
        await devServer.viteServer.close();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        httpServer.close();
        await devServer.viteServer.close();
        process.exit(0);
    });
}

start().catch((e) => {
    console.error('Failed to start:', e.message);
    process.exit(1);
});
