/**
 * Starts a dev server for a fixture page, for manual debugging.
 *
 * Usage:
 *   yarn serve-fixture <fixture-name> [--no-ssr]
 *   yarn serve-fixture --list
 *   yarn serve-fixture --help
 *
 * Options:
 *   --no-ssr    Disable SSR (client-only rendering, element target)
 *   --list      List available fixtures
 *   --help      Show this help
 *
 * Opens on http://localhost:3333. Press Ctrl+C to stop.
 */

import { mkDevServer } from '../lib';
import type { JayRollupConfig } from '@jay-framework/vite-plugin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function listFixtures(): string[] {
    return fs
        .readdirSync(__dirname, { withFileTypes: true })
        .filter(
            (d) =>
                d.isDirectory() &&
                fs.existsSync(path.join(__dirname, d.name, 'page.jay-html')),
        )
        .map((d) => d.name)
        .sort();
}

function printHelp() {
    console.log(`
Usage: yarn serve-fixture <fixture-name> [--no-ssr]

Options:
  --no-ssr    Disable SSR (client-only rendering, element target)
  --list      List available fixtures
  --help      Show this help

Examples:
  yarn serve-fixture 5a-page-headless-static
  yarn serve-fixture 5a-page-headless-static --no-ssr
  yarn serve-fixture --list
`);
}

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
    if (args.length === 0) {
        console.log('Available fixtures:');
        listFixtures().forEach((f) => console.log(`  ${f}`));
    }
    process.exit(args.length === 0 ? 1 : 0);
}

if (args.includes('--list')) {
    listFixtures().forEach((f) => console.log(f));
    process.exit(0);
}

const disableSSR = args.includes('--no-ssr');
const fixtureName = args.find((a) => !a.startsWith('--'));

if (!fixtureName) {
    console.error('Error: no fixture name provided.');
    printHelp();
    process.exit(1);
}

const dirPath = path.resolve(__dirname, fixtureName);
if (!fs.existsSync(path.join(dirPath, 'page.jay-html'))) {
    console.error(`Error: fixture "${fixtureName}" not found (no page.jay-html).`);
    console.error('');
    console.error('Available fixtures:');
    listFixtures().forEach((f) => console.error(`  ${f}`));
    process.exit(1);
}

async function start() {
    console.log(`Starting dev server for fixture: ${fixtureName}`);
    console.log(`Directory: ${dirPath}`);
    console.log(`SSR: ${disableSSR ? 'disabled' : 'enabled'}`);

    const devServer = await mkDevServer({
        pagesRootFolder: dirPath,
        projectRootFolder: dirPath,
        jayRollupConfig: {
            tsConfigFilePath: path.join(dirPath, 'tsconfig.json'),
        } as JayRollupConfig,
        disableSSR,
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
        console.log(`  SSR: ${disableSSR ? 'disabled (client-only)' : 'enabled'}`);
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
