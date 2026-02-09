/**
 * Shared service initialization for CLI commands.
 *
 * Used by commands that need to load plugin services (agent-kit, action, params, contracts).
 */

import chalk from 'chalk';
import { createViteForCli } from '@jay-framework/dev-server';
import { getLogger } from '@jay-framework/logger';

export type InitializeServicesForCli = typeof initializeServicesForCli;

/**
 * Initializes services for CLI use (loads init.ts and runs callbacks).
 *
 * Uses the provided Vite server for TypeScript transpilation when loading
 * init files and plugin modules.
 */
export async function initializeServicesForCli(
    projectRoot: string,
    viteServer?: Awaited<ReturnType<typeof createViteForCli>>,
): Promise<Map<symbol, unknown>> {
    const path = await import('node:path');
    const fs = await import('node:fs');

    const {
        runInitCallbacks,
        getServiceRegistry,
        discoverPluginsWithInit,
        sortPluginsByDependencies,
        executePluginServerInits,
    } = await import('@jay-framework/stack-server-runtime');

    try {
        // Discover and initialize plugins
        const discoveredPlugins = await discoverPluginsWithInit({
            projectRoot,
            verbose: false,
        });
        const pluginsWithInit = sortPluginsByDependencies(discoveredPlugins);

        // Execute plugin server inits with Vite for TypeScript support
        try {
            await executePluginServerInits(pluginsWithInit, viteServer, false);
        } catch (error: any) {
            getLogger().warn(chalk.yellow(`⚠️  Plugin initialization skipped: ${error.message}`));
        }

        // Load project init.ts/js if it exists
        const initPathTs = path.join(projectRoot, 'src', 'init.ts');
        const initPathJs = path.join(projectRoot, 'src', 'init.js');

        let initModule: any;
        if (fs.existsSync(initPathTs) && viteServer) {
            initModule = await viteServer.ssrLoadModule(initPathTs);
        } else if (fs.existsSync(initPathJs)) {
            initModule = await import(initPathJs);
        }

        if (initModule?.init?._serverInit) {
            await initModule.init._serverInit();
        }

        await runInitCallbacks();
    } catch (error: any) {
        getLogger().warn(chalk.yellow(`⚠️  Service initialization failed: ${error.message}`));
        getLogger().warn(chalk.gray('   Static contracts will still be listed.'));
    }

    return getServiceRegistry();
}
