/**
 * CLI handler for `jay-stack action <plugin>/<action>`.
 *
 * Runs a plugin action from the command line, returning the result as JSON or YAML.
 * Agents use this to discover valid prop values for headless components.
 *
 * See Design Log #84 (Phase 5), #85, #86.
 */

import chalk from 'chalk';
import YAML from 'yaml';
import { createViteForCli } from '@jay-framework/dev-server';
import { getLogger } from '@jay-framework/logger';
import type { InitializeServicesForCli } from './cli-services';

export interface RunActionOptions {
    input?: string;
    yaml?: boolean;
    verbose?: boolean;
}

export async function runAction(
    actionRef: string,
    options: RunActionOptions,
    projectRoot: string,
    initializeServices: InitializeServicesForCli,
): Promise<void> {
    let viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined;

    try {
        const slashIndex = actionRef.indexOf('/');
        if (slashIndex === -1) {
            getLogger().error(
                chalk.red('❌ Invalid action reference. Use format: <plugin>/<action>'),
            );
            process.exit(1);
        }

        const actionExport = actionRef.substring(slashIndex + 1);
        const input = options.input ? JSON.parse(options.input) : {};

        if (options.verbose) {
            getLogger().info('Starting Vite for TypeScript support...');
        }
        viteServer = await createViteForCli({ projectRoot });

        await initializeServices(projectRoot, viteServer);

        // Discover and register actions
        const { discoverAndRegisterActions, discoverAllPluginActions, ActionRegistry } =
            await import('@jay-framework/stack-server-runtime');

        const registry = new ActionRegistry();

        await discoverAndRegisterActions({
            projectRoot,
            registry,
            verbose: options.verbose,
            viteServer,
        });
        await discoverAllPluginActions({
            projectRoot,
            registry,
            verbose: options.verbose,
            viteServer,
        });

        // Find the action by export name, dotted suffix, or full ref
        const allNames = registry.getNames();
        const matchedName =
            allNames.find((name) => name === actionExport) ||
            allNames.find((name) => name.endsWith('.' + actionExport)) ||
            allNames.find((name) => name === actionRef);

        if (!matchedName) {
            getLogger().error(chalk.red(`❌ Action "${actionExport}" not found.`));
            if (allNames.length > 0) {
                getLogger().error(`   Available actions: ${allNames.join(', ')}`);
            } else {
                getLogger().error('   No actions registered. Does the plugin have actions?');
            }
            process.exit(1);
        }

        if (options.verbose) {
            getLogger().info(`Executing action: ${matchedName}`);
            getLogger().info(`Input: ${JSON.stringify(input)}`);
        }

        const result = await registry.execute(matchedName, input);

        if (result.success) {
            if (options.yaml) {
                getLogger().important(YAML.stringify(result.data));
            } else {
                getLogger().important(JSON.stringify(result.data, null, 2));
            }
        } else {
            getLogger().error(
                chalk.red(`❌ Action failed: [${result.error.code}] ${result.error.message}`),
            );
            process.exit(1);
        }
    } catch (error: any) {
        getLogger().error(chalk.red('❌ Failed to run action:') + ' ' + error.message);
        if (options.verbose) {
            getLogger().error(error.stack);
        }
        process.exit(1);
    } finally {
        if (viteServer) {
            await viteServer.close();
        }
    }
}
