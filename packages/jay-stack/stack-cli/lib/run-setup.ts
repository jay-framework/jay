/**
 * CLI handler for `jay-stack setup [plugin]`.
 *
 * Discovers plugins with setup handlers, initializes services, and runs
 * each plugin's setup function. Setup handles config creation and
 * credential/service validation only. Reference data generation is
 * handled by `jay-stack agent-kit` (see cli.ts agent-kit command).
 *
 * See Design Log #87.
 */

import chalk from 'chalk';
import { createViteForCli } from '@jay-framework/dev-server';
import { getLogger } from '@jay-framework/logger';
import { SetupNeedsAnswerError } from '@jay-framework/stack-server-runtime';
import { loadConfig } from './config';
import {
    createInteractivePrompt,
    createAnswersFilePrompt,
    createDefaultPrompt,
} from './setup-prompts';
import type { InitializeServicesForCli } from './cli-services';

export interface RunSetupOptions {
    force?: boolean;
    interactive?: boolean;
    answers?: string;
    verbose?: boolean;
}

export async function runSetup(
    pluginFilter: string | undefined,
    options: RunSetupOptions,
    projectRoot: string,
    initializeServices: InitializeServicesForCli,
): Promise<void> {
    let viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined;

    try {
        const logger = getLogger();
        const path = await import('node:path');

        // Load project config to get configBase
        const jayConfig = loadConfig();
        const configDir = path.resolve(projectRoot, jayConfig.devServer?.configBase || './config');

        logger.important(chalk.bold('\n🔧 Setting up plugins...\n'));

        if (options.verbose) {
            logger.info('Starting Vite for TypeScript support...');
        }
        viteServer = await createViteForCli({ projectRoot });

        // Discover plugins with setup handlers
        const { discoverPluginsWithSetup, executePluginSetup } = await import(
            '@jay-framework/stack-server-runtime'
        );

        const pluginsWithSetup = await discoverPluginsWithSetup({
            projectRoot,
            verbose: options.verbose,
            pluginFilter,
        });

        if (pluginsWithSetup.length === 0) {
            if (pluginFilter) {
                logger.important(
                    chalk.yellow(`⚠️  Plugin "${pluginFilter}" not found or has no setup handler.`),
                );
            } else {
                logger.important(chalk.gray('No plugins with setup handlers found.'));
            }
            return;
        }

        if (options.verbose) {
            logger.info(
                `Found ${pluginsWithSetup.length} plugin(s) with setup: ${pluginsWithSetup.map((p) => p.name).join(', ')}`,
            );
        }

        // Initialize services (for all plugins, dependency-ordered)
        // Capture per-plugin init errors — setup handlers need to know
        const { initErrors } = await initializeServices(projectRoot, viteServer);
        if (initErrors.size > 0 && options.verbose) {
            for (const [name, err] of initErrors) {
                logger.info(chalk.yellow(`⚠️  ${name} init error: ${err.message}`));
            }
        }

        // Determine prompt mode
        const interactive = options.interactive === true;
        let answersMap: Record<string, string> | undefined;
        if (options.answers) {
            const fs = await import('node:fs');
            const YAML = await import('yaml');
            answersMap = YAML.parse(fs.readFileSync(options.answers, 'utf-8')) || {};
        }

        let configured = 0;
        let needsConfig = 0;
        let errors = 0;

        for (const plugin of pluginsWithSetup) {
            logger.important(chalk.bold(`📦 ${plugin.name}`));

            if (plugin.setupDescription && options.verbose) {
                logger.important(chalk.gray(`   ${plugin.setupDescription}`));
            }

            const prompt = interactive
                ? createInteractivePrompt()
                : answersMap
                  ? createAnswersFilePrompt(answersMap, plugin.name)
                  : createDefaultPrompt(plugin.name);

            try {
                const result = await executePluginSetup(plugin, {
                    projectRoot,
                    configDir,
                    force: options.force ?? false,
                    interactive,
                    prompt,
                    initError: initErrors.get(plugin.name),
                    viteServer,
                    verbose: options.verbose,
                });

                switch (result.status) {
                    case 'configured':
                        configured++;
                        logger.important(chalk.green('   ✅ Services verified'));
                        if (result.configCreated?.length) {
                            for (const cfg of result.configCreated) {
                                logger.important(chalk.green(`   ✅ Created ${cfg}`));
                            }
                        }
                        if (result.message) {
                            logger.important(chalk.gray(`   ${result.message}`));
                        }
                        break;

                    case 'needs-config':
                        needsConfig++;
                        if (result.configCreated?.length) {
                            for (const cfg of result.configCreated) {
                                logger.important(
                                    chalk.yellow(`   ⚠️  Config template created: ${cfg}`),
                                );
                            }
                        }
                        if (result.message) {
                            logger.important(chalk.yellow(`   → ${result.message}`));
                        } else {
                            logger.important(
                                chalk.yellow(
                                    `   → Fill in credentials and re-run: jay-stack setup ${plugin.name}`,
                                ),
                            );
                        }
                        break;

                    case 'error':
                        errors++;
                        logger.important(chalk.red(`   ❌ ${result.message || 'Setup failed'}`));
                        break;
                }
            } catch (error: any) {
                if (error instanceof SetupNeedsAnswerError) {
                    needsConfig++;
                    logger.important('');
                    logger.important(chalk.yellow('setup-needs-answer:'));
                    logger.important(chalk.yellow(`  plugin: ${error.plugin}`));
                    logger.important(chalk.yellow(`  key: ${error.key}`));
                    logger.important(chalk.yellow(`  type: ${error.type}`));
                    logger.important(chalk.yellow(`  message: "${error.promptMessage}"`));
                    if (error.choices) {
                        logger.important(chalk.yellow('  choices:'));
                        for (const c of error.choices) {
                            logger.important(chalk.yellow(`    - ${c.value}: ${c.name}`));
                        }
                    }
                    logger.important('');
                    logger.important(
                        chalk.gray(
                            `Provide the answer: jay-stack-cli setup --answers answers.yaml`,
                        ),
                    );
                    logger.important(chalk.gray(`answers.yaml format:\n  ${error.key}: "your-answer"`));
                } else {
                    errors++;
                    logger.important(chalk.red(`   ❌ Setup failed: ${error.message}`));
                    if (options.verbose) {
                        logger.error(error.stack);
                    }
                }
            }

            logger.important(''); // blank line between plugins
        }

        // Summary
        const parts: string[] = [];
        if (configured > 0) parts.push(`${configured} configured`);
        if (needsConfig > 0) parts.push(`${needsConfig} needs config`);
        if (errors > 0) parts.push(`${errors} error(s)`);

        logger.important(`Setup complete: ${parts.join(', ')}`);

        if (errors > 0) {
            process.exit(1);
        }
    } catch (error: any) {
        getLogger().error(chalk.red('❌ Setup failed:') + ' ' + error.message);
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
