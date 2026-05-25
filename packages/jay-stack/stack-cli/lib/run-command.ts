/**
 * CLI handler for `jay-stack run <plugin>/<command>`.
 *
 * Discovers plugin CLI commands, loads .jay-command metadata for input schema,
 * parses CLI flags, initializes services, registers CONSOLE_CONTEXT, and
 * executes the command handler.
 *
 * See Design Log #142.
 */

import chalk from 'chalk';
import path from 'node:path';
import { createViteForCli } from '@jay-framework/dev-server';
import { getLogger } from '@jay-framework/logger';
import type { InitializeServicesForCli } from './cli-services';
import { loadConfig } from './config';

export interface RunCommandOptions {
    list?: boolean;
    verbose?: boolean;
}

export async function runCommand(
    commandRef: string | undefined,
    rawArgs: string[],
    options: RunCommandOptions,
    projectRoot: string,
    initializeServices: InitializeServicesForCli,
): Promise<void> {
    let viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined;

    try {
        const {
            discoverPluginCommands,
            commandSchemaToFlags,
            parseInputFromFlags,
            executePluginCommand,
        } = await import('@jay-framework/stack-server-runtime');

        const commands = await discoverPluginCommands({
            projectRoot,
            verbose: options.verbose,
        });

        // --list mode
        if (options.list || !commandRef) {
            printCommandList(commands);
            return;
        }

        // Parse <plugin>/<command>
        const slashIndex = commandRef.indexOf('/');
        if (slashIndex === -1) {
            getLogger().error(
                chalk.red('Invalid command reference. Use format: <plugin>/<command>'),
            );
            getLogger().error(chalk.gray('Example: jay-stack run media/upload-public'));
            process.exit(1);
        }

        const pluginName = commandRef.substring(0, slashIndex);
        const commandName = commandRef.substring(slashIndex + 1);

        // Find the command
        const command = commands.find(
            (c) =>
                (c.pluginName === pluginName || c.packageName === pluginName) &&
                c.commandName === commandName,
        );

        if (!command) {
            getLogger().error(chalk.red(`Command "${commandRef}" not found.`));
            const pluginCommands = commands.filter(
                (c) => c.pluginName === pluginName || c.packageName === pluginName,
            );
            if (pluginCommands.length > 0) {
                getLogger().error(`Available commands for ${pluginName}:`);
                for (const c of pluginCommands) {
                    getLogger().error(
                        `   ${c.commandName}${c.metadata?.description ? '    ' + c.metadata.description : ''}`,
                    );
                }
            } else if (commands.length > 0) {
                getLogger().error('Available plugins with commands:');
                const plugins = [...new Set(commands.map((c) => c.pluginName))];
                for (const p of plugins) {
                    getLogger().error(`   ${p}`);
                }
            } else {
                getLogger().error('No plugins with CLI commands found.');
            }
            process.exit(1);
        }

        // Parse input from CLI flags using .jay-command inputSchema
        let input: Record<string, any> = {};
        if (command.metadata?.inputSchema) {
            const flagDefs = commandSchemaToFlags(command.metadata.inputSchema);
            const rawOptions = parseRawFlags(rawArgs, flagDefs);
            input = parseInputFromFlags(rawOptions, command.metadata.inputSchema);
        }

        // Start Vite
        if (options.verbose) {
            getLogger().info('Starting Vite for TypeScript support...');
        }
        viteServer = await createViteForCli({ projectRoot });

        // Initialize services
        await initializeServices(projectRoot, viteServer);

        // Register CONSOLE_CONTEXT
        const { registerService } = await import('@jay-framework/stack-server-runtime');
        const { CONSOLE_CONTEXT } = await import('@jay-framework/fullstack-component');
        const jayConfig = loadConfig();
        const publicFolder = path.resolve(
            projectRoot,
            jayConfig.devServer?.publicFolder || 'public',
        );
        const buildRoot = path.resolve(projectRoot, 'build/v1');

        registerService(CONSOLE_CONTEXT as any, {
            projectRoot,
            publicFolder,
            build: {
                frontend: path.join(buildRoot, 'frontend'),
                backend: path.join(buildRoot, 'backend'),
            },
            verbose: options.verbose ?? false,
            log: (msg: string) => getLogger().important(msg),
            warn: (msg: string) => getLogger().warn(chalk.yellow(msg)),
            error: (msg: string) => getLogger().error(chalk.red(msg)),
        });

        // Execute
        if (options.verbose) {
            getLogger().info(`Executing ${command.pluginName}/${command.commandName}...`);
        }

        const result = await executePluginCommand(command, input, viteServer);

        if (!result.success) {
            process.exit(1);
        }
    } catch (error: any) {
        getLogger().error(chalk.red('Command failed:') + ' ' + error.message);
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

function printCommandList(
    commands: Array<{
        pluginName: string;
        commandName: string;
        metadata?: { description?: string };
    }>,
): void {
    const logger = getLogger();

    if (commands.length === 0) {
        logger.important(chalk.gray('No plugins with CLI commands found.'));
        return;
    }

    logger.important('\nAvailable plugin commands:\n');

    const byPlugin = new Map<string, typeof commands>();
    for (const cmd of commands) {
        if (!byPlugin.has(cmd.pluginName)) byPlugin.set(cmd.pluginName, []);
        byPlugin.get(cmd.pluginName)!.push(cmd);
    }

    for (const [pluginName, cmds] of byPlugin) {
        logger.important(chalk.bold(`  ${pluginName}`));
        for (const cmd of cmds) {
            const desc = cmd.metadata?.description ? `    ${cmd.metadata.description}` : '';
            logger.important(`    ${cmd.commandName}${desc}`);
        }
        logger.important('');
    }
}

/**
 * Parse raw CLI args into a key-value map based on flag definitions.
 * Handles --flag value (string/number) and --flag (boolean).
 */
function parseRawFlags(
    args: string[],
    flagDefs: Array<{ flag: string; type: string }>,
): Record<string, any> {
    const result: Record<string, any> = {};
    const booleanFlags = new Set(
        flagDefs
            .filter((f) => f.type === 'boolean')
            .map((f) => {
                const match = f.flag.match(/^--(\S+)/);
                return match ? match[1] : '';
            }),
    );

    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const name = arg.slice(2);
            if (booleanFlags.has(name)) {
                result[name] = true;
                i++;
            } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                result[name] = args[i + 1];
                i += 2;
            } else {
                result[name] = true;
                i++;
            }
        } else {
            i++;
        }
    }

    return result;
}
