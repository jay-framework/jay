/**
 * CLI handler for `jay-stack params <plugin>/<contract>`.
 *
 * Discovers load param values for a contract by running its loadParams generator.
 * Agents use this for SSG route discovery.
 *
 * See Design Log #84 (Phase 5), #85, #86.
 */

import chalk from 'chalk';
import YAML from 'yaml';
import { createViteForCli } from '@jay-framework/dev-server';
import { getLogger } from '@jay-framework/logger';
import type { InitializeServicesForCli } from './cli-services';

export interface RunParamsOptions {
    yaml?: boolean;
    verbose?: boolean;
}

export async function runParams(
    contractRef: string,
    options: RunParamsOptions,
    projectRoot: string,
    initializeServices: InitializeServicesForCli,
): Promise<void> {
    let viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined;

    try {
        const slashIndex = contractRef.indexOf('/');
        if (slashIndex === -1) {
            getLogger().error(
                chalk.red('❌ Invalid contract reference. Use format: <plugin>/<contract>'),
            );
            process.exit(1);
        }

        const pluginName = contractRef.substring(0, slashIndex);
        const contractName = contractRef.substring(slashIndex + 1);

        if (options.verbose) {
            getLogger().info('Starting Vite for TypeScript support...');
        }
        viteServer = await createViteForCli({ projectRoot });

        await initializeServices(projectRoot, viteServer);

        // Resolve the plugin component to find the loadParams generator
        const { resolvePluginComponent } = await import('@jay-framework/compiler-shared');
        const resolution = resolvePluginComponent(projectRoot, pluginName, contractName);

        if (resolution.validations.length > 0 || !resolution.val) {
            getLogger().error(
                chalk.red(`❌ Could not resolve plugin "${pluginName}" contract "${contractName}"`),
            );
            for (const msg of resolution.validations) {
                getLogger().error(`   ${msg}`);
            }
            process.exit(1);
        }

        const componentPath = resolution.val.componentPath;
        const componentName = resolution.val.componentName;

        if (options.verbose) {
            getLogger().info(`Loading component "${componentName}" from ${componentPath}`);
        }

        const module = await viteServer.ssrLoadModule(componentPath);
        const component = module[componentName];

        if (!component || !component.loadParams) {
            getLogger().error(
                chalk.red(`❌ Component "${componentName}" does not have loadParams.`),
            );
            getLogger().error(
                '   Only components with withLoadParams() expose discoverable URL params.',
            );
            process.exit(1);
        }

        // Resolve services for loadParams
        const { resolveServices } = await import('@jay-framework/stack-server-runtime');
        const resolvedServices = resolveServices(component.services || []);

        // Run loadParams generator
        const allParams: Record<string, string>[] = [];
        const paramsGenerator = component.loadParams(resolvedServices);

        for await (const batch of paramsGenerator) {
            allParams.push(...batch);
        }

        if (options.yaml) {
            getLogger().important(YAML.stringify(allParams));
        } else {
            getLogger().important(JSON.stringify(allParams, null, 2));
        }

        if (!options.yaml) {
            getLogger().important(
                chalk.green(`\n✅ Found ${allParams.length} param combination(s)`),
            );
        }
    } catch (error: any) {
        getLogger().error(chalk.red('❌ Failed to discover params:') + ' ' + error.message);
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
