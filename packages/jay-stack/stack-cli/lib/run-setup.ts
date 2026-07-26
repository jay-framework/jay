/**
 * CLI handler for `jay-stack setup [plugin]`.
 *
 * Runs setup and init per plugin in dependency order:
 *   1. Run setup handler (creates config, prompts for credentials)
 *   2. If configured, run init (registers services)
 *   3. Next plugin — can now use services registered by earlier plugins
 *
 * See Design Log #87, #157, #159.
 */

import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import YAML from 'yaml';
import { createViteForCli } from '@jay-framework/dev-server';
import { getLogger } from '@jay-framework/logger';
import {
    SetupNeedsAnswerError,
    discoverPluginsWithSetup,
    executePluginSetup,
    discoverPluginsWithInit,
    sortPluginsByDependencies,
    executePluginServerInits,
    runInitCallbacks,
} from '@jay-framework/stack-server-runtime';
import { loadConfig } from './config';
import {
    createInteractivePrompt,
    createAnswersFilePrompt,
    createDefaultPrompt,
} from './setup-prompts';

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
): Promise<void> {
    let viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined;

    try {
        const logger = getLogger();

        const jayConfig = loadConfig();
        const configDir = path.resolve(projectRoot, jayConfig.devServer?.configBase || './config');

        logger.important(chalk.bold('\n🔧 Setting up plugins...\n'));

        if (options.verbose) {
            logger.info('Starting Vite for TypeScript support...');
        }
        viteServer = await createViteForCli({ projectRoot });

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

        // Discover plugins with init (for per-plugin init after setup)
        const allPluginsWithInit = sortPluginsByDependencies(
            await discoverPluginsWithInit({ projectRoot, verbose: options.verbose }),
        );

        // Determine prompt mode
        const interactive = options.interactive === true;
        let answersMap: Record<string, string> | undefined;
        if (options.answers) {
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
                    initError: undefined,
                    viteServer,
                    verbose: options.verbose,
                });

                switch (result.status) {
                    case 'configured':
                        configured++;
                        if (result.configCreated?.length) {
                            for (const cfg of result.configCreated) {
                                logger.important(chalk.green(`   ✅ Created ${cfg}`));
                            }
                        }
                        if (result.message) {
                            logger.important(chalk.gray(`   ${result.message}`));
                        }

                        // Init this plugin now — config files are in place
                        await initPlugin(plugin.name, allPluginsWithInit, viteServer, logger);
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
                    logger.important(chalk.gray('Provide the answer via file:'));
                    logger.important(chalk.gray(`  jay-stack-cli setup --answers answers.yaml`));
                    logger.important(chalk.gray(`  answers.yaml format:`));
                    logger.important(chalk.gray(`    ${error.key}: "your-answer"`));
                    logger.important('');
                    logger.important(chalk.gray('Or run interactively:'));
                    logger.important(chalk.gray(`  jay-stack-cli setup --interactive`));
                } else {
                    errors++;
                    logger.important(chalk.red(`   ❌ Setup failed: ${error.message}`));
                    if (options.verbose) {
                        logger.error(error.stack);
                    }
                }
            }

            logger.important('');
        }

        // Run project init.ts and lifecycle callbacks after all plugins
        await runProjectInit(projectRoot, viteServer);

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

/**
 * Init a single plugin after its setup succeeds.
 * Finds the matching entry in the init discovery list and runs it quietly.
 */
async function initPlugin(
    pluginName: string,
    allPluginsWithInit: Awaited<ReturnType<typeof discoverPluginsWithInit>>,
    viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined,
    logger: ReturnType<typeof getLogger>,
): Promise<void> {
    const pluginInit = allPluginsWithInit.filter((p) => p.name === pluginName);
    if (pluginInit.length === 0) return;

    const initErrors = await executePluginServerInits(pluginInit, viteServer, false, true);
    if (initErrors.size > 0) {
        for (const [, err] of initErrors) {
            logger.important(chalk.yellow(`   ⚠️  Init after setup: ${err.message}`));
        }
    } else {
        logger.important(chalk.green(`   ✅ Services initialized`));
    }
}

/**
 * Load and run project init.ts + lifecycle callbacks.
 */
async function runProjectInit(
    projectRoot: string,
    viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined,
): Promise<void> {
    try {
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
    } catch {
        // Project init is optional during setup
    }
}
