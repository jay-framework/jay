import { Command } from 'commander';
import chalk from 'chalk';
import YAML from 'yaml';
import { validatePlugin, type ValidationResult } from '@jay-framework/plugin-validator';
import { startDevServer } from './server';
import { validateJayFiles, printJayValidationResult } from './validate';
import {
    materializeContracts,
    listContracts,
    type ContractsIndex,
} from '@jay-framework/stack-server-runtime';
import { createViteForCli } from '@jay-framework/dev-server';
import { setDevLogger, createDevLogger, getLogger, type LogLevel } from '@jay-framework/logger';
import { initializeServicesForCli } from './cli-services';
import { runAction } from './run-action';
import { runParams } from './run-params';
import { runSetup } from './run-setup';

const program = new Command();

program
    .name('jay-stack')
    .description('Jay Stack CLI - Development server and plugin validation')
    .version('0.9.0');

// Dev server command (existing functionality)
program
    .command('dev [path]')
    .description('Start the Jay Stack development server')
    .option('-v, --verbose', 'Enable verbose logging output')
    .option('-q, --quiet', 'Suppress all non-error output')
    .option('--test-mode', 'Enable test endpoints (/_jay/health, /_jay/shutdown)')
    .option('--timeout <seconds>', 'Auto-shutdown after N seconds (implies --test-mode)', parseInt)
    .action(async (path, options) => {
        try {
            // Determine log level from flags
            const logLevel: LogLevel = options.quiet
                ? 'silent'
                : options.verbose
                  ? 'verbose'
                  : 'info';

            // Set up dev logger with timing support before anything else
            setDevLogger(createDevLogger(logLevel));

            // --timeout implies --test-mode
            const testMode = options.testMode || options.timeout !== undefined;

            await startDevServer({
                projectPath: path || process.cwd(),
                testMode,
                timeout: options.timeout,
                logLevel,
            });
        } catch (error: any) {
            getLogger().error(chalk.red('Error starting dev server:') + ' ' + error.message);
            process.exit(1);
        }
    });

// Jay file validation command
program
    .command('validate [path]')
    .description('Validate all .jay-html and .jay-contract files in the project')
    .option('-v, --verbose', 'Show per-file validation status')
    .option('--json', 'Output results as JSON')
    .action(async (scanPath, options) => {
        try {
            const result = await validateJayFiles({
                path: scanPath,
                verbose: options.verbose,
                json: options.json,
            });

            printJayValidationResult(result, options);

            if (!result.valid) {
                process.exit(1);
            }
        } catch (error: any) {
            if (options.json) {
                getLogger().important(
                    JSON.stringify({ valid: false, error: error.message }, null, 2),
                );
            } else {
                getLogger().error(chalk.red('Validation error:') + ' ' + error.message);
            }
            process.exit(1);
        }
    });

// Plugin validation command (new)
program
    .command('validate-plugin [path]')
    .description('Validate a Jay Stack plugin package')
    .option('--local', 'Validate local plugins in src/plugins/')
    .option('-v, --verbose', 'Show detailed validation output')
    .option('--strict', 'Treat warnings as errors (for CI)')
    .option('--generate-types', 'Generate .d.ts files for contracts')
    .action(async (pluginPath, options) => {
        try {
            const result = await validatePlugin({
                pluginPath: pluginPath || process.cwd(),
                local: options.local,
                verbose: options.verbose,
                strict: options.strict,
                generateTypes: options.generateTypes,
            });

            printValidationResult(result, options.verbose);

            if (!result.valid || (options.strict && result.warnings.length > 0)) {
                process.exit(1);
            }
        } catch (error: any) {
            getLogger().error(chalk.red('Validation error:') + ' ' + error.message);
            process.exit(1);
        }
    });

/**
 * Copies agent-kit documentation files from the template folder.
 * Does not overwrite existing files so users can customize.
 * Use --force to regenerate all docs.
 * Template folder: stack-cli/agent-kit-template/ (Design Log #85).
 */
async function ensureAgentKitDocs(projectRoot: string, force?: boolean): Promise<void> {
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');

    const agentKitDir = path.join(projectRoot, 'agent-kit');
    await fs.mkdir(agentKitDir, { recursive: true });

    // Resolve template folder: ../agent-kit-template/ relative to dist/index.js (or lib/ in dev)
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const templateDir = path.resolve(thisDir, '..', 'agent-kit-template');

    let files: string[];
    try {
        files = (await fs.readdir(templateDir)).filter((f) => f.endsWith('.md'));
    } catch {
        getLogger().warn(chalk.yellow('   Agent-kit template folder not found: ' + templateDir));
        return;
    }

    for (const filename of files) {
        const destPath = path.join(agentKitDir, filename);
        if (!force) {
            try {
                await fs.access(destPath);
                continue; // File exists, don't overwrite
            } catch {
                // File doesn't exist, copy it
            }
        }
        await fs.copyFile(path.join(templateDir, filename), destPath);
        getLogger().info(chalk.gray(`   Created agent-kit/${filename}`));
    }
}

/**
 * Discovers and runs plugin reference generators (Design Log #87).
 * Called by agent-kit after materializing contracts. Services are already initialized
 * by runMaterialize, so references handlers can use them directly.
 */
async function generatePluginReferences(
    projectRoot: string,
    options: { plugin?: string; force?: boolean; verbose?: boolean },
): Promise<void> {
    const { discoverPluginsWithReferences, executePluginReferences } = await import(
        '@jay-framework/stack-server-runtime'
    );

    const plugins = await discoverPluginsWithReferences({
        projectRoot,
        verbose: options.verbose,
        pluginFilter: options.plugin,
    });

    if (plugins.length === 0) return;

    const logger = getLogger();
    logger.important('');
    logger.important(chalk.bold('📚 Generating plugin references...'));

    for (const plugin of plugins) {
        try {
            const result = await executePluginReferences(plugin, {
                projectRoot,
                force: options.force ?? false,
                verbose: options.verbose,
            });

            if (result.referencesCreated.length > 0) {
                logger.important(chalk.green(`   ✅ ${plugin.name}:`));
                for (const ref of result.referencesCreated) {
                    logger.important(chalk.gray(`      ${ref}`));
                }
                if (result.message) {
                    logger.important(chalk.gray(`      ${result.message}`));
                }
            }
        } catch (error: any) {
            logger.warn(
                chalk.yellow(`   ⚠️  ${plugin.name}: references skipped — ${error.message}`),
            );
        }
    }
}

/** Shared action for contract materialization (used by both contracts and agent-kit) */
async function runMaterialize(
    projectRoot: string,
    options: {
        output?: string;
        yaml?: boolean;
        list?: boolean;
        plugin?: string;
        dynamicOnly?: boolean;
        force?: boolean;
        verbose?: boolean;
    },
    /** Relative path from project root, e.g. 'agent-kit/materialized-contracts' or 'build/materialized-contracts' */
    defaultOutputRelative: string,
) {
    const path = await import('node:path');
    const outputDir = options.output ?? path.join(projectRoot, defaultOutputRelative);
    let viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined;

    try {
        if (options.list) {
            const index = await listContracts({
                projectRoot,
                dynamicOnly: options.dynamicOnly,
                pluginFilter: options.plugin,
            });

            if (options.yaml) {
                getLogger().important(YAML.stringify(index));
            } else {
                printContractList(index);
            }
            return;
        }

        if (options.verbose) {
            getLogger().info('Starting Vite for TypeScript support...');
        }
        viteServer = await createViteForCli({ projectRoot });

        const services = await initializeServicesForCli(projectRoot, viteServer);

        const result = await materializeContracts(
            {
                projectRoot,
                outputDir,
                force: options.force,
                dynamicOnly: options.dynamicOnly,
                pluginFilter: options.plugin,
                verbose: options.verbose,
                viteServer,
            },
            services,
        );

        if (options.yaml) {
            getLogger().important(YAML.stringify(result.index));
        } else {
            getLogger().important(
                chalk.green(`\n✅ Materialized ${result.index.contracts.length} contracts`),
            );
            getLogger().important(`   Static: ${result.staticCount}`);
            getLogger().important(`   Dynamic: ${result.dynamicCount}`);
            getLogger().important(`   Output: ${result.outputDir}`);
        }
    } catch (error: any) {
        getLogger().error(chalk.red('❌ Failed to materialize contracts:') + ' ' + error.message);
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

// Plugin setup command (Design Log #87): create config, validate services, generate references
program
    .command('setup [plugin]')
    .description(
        'Run plugin setup: create config templates, validate credentials, generate reference data',
    )
    .option('--force', 'Force re-run (overwrite config templates and regenerate references)')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (plugin: string | undefined, options) => {
        await runSetup(plugin, options, process.cwd(), initializeServicesForCli);
    });

// Agent kit command (Design Log #85/#87): prepare agent-kit folder with contracts, docs, and references
program
    .command('agent-kit')
    .description(
        'Prepare the agent kit: materialize contracts, generate references, and write docs to agent-kit/',
    )
    .option('-o, --output <dir>', 'Output directory (default: agent-kit/materialized-contracts)')
    .option('--yaml', 'Output contract index as YAML to stdout')
    .option('--list', 'List contracts without writing files')
    .option('--plugin <name>', 'Filter to specific plugin')
    .option('--dynamic-only', 'Only process dynamic contracts')
    .option('--force', 'Force re-materialization')
    .option('--no-references', 'Skip reference data generation')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (options) => {
        const projectRoot = process.cwd();
        await runMaterialize(projectRoot, options, 'agent-kit/materialized-contracts');
        if (!options.list) {
            await ensureAgentKitDocs(projectRoot, options.force);
            // Generate plugin reference data (Design Log #87)
            if (options.references !== false) {
                await generatePluginReferences(projectRoot, options);
            }
        }
    });

// Action execution command (Design Log #84/#85/#86): run a plugin action from CLI for agent discovery
program
    .command('action <plugin/action>')
    .description(
        'Run a plugin action (e.g., jay-stack action wix-stores/searchProducts --input \'{"query":""}\')',
    )
    .option('--input <json>', 'JSON input for the action (default: {})')
    .option('--yaml', 'Output result as YAML instead of JSON')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (actionRef: string, options) => {
        await runAction(actionRef, options, process.cwd(), initializeServicesForCli);
    });

// Params discovery command (Design Log #84/#86): discover load param values for a contract
program
    .command('params <plugin/contract>')
    .description(
        'Discover load param values for a contract (e.g., jay-stack params wix-stores/product-page)',
    )
    .option('--yaml', 'Output result as YAML instead of JSON')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (contractRef: string, options) => {
        await runParams(contractRef, options, process.cwd(), initializeServicesForCli);
    });

// Parse arguments
program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}

/**
 * Pretty prints validation results
 */
function printValidationResult(result: ValidationResult, verbose: boolean): void {
    const logger = getLogger();
    if (result.valid && result.warnings.length === 0) {
        logger.important(chalk.green('✅ Plugin validation successful!\n'));
        if (verbose) {
            logger.important('Plugin: ' + result.pluginName);
            logger.important('  ✅ plugin.yaml valid');
            logger.important(`  ✅ ${result.contractsChecked} contracts validated`);
            if (result.typesGenerated) {
                logger.important(`  ✅ ${result.typesGenerated} type definitions generated`);
            }
            logger.important(`  ✅ ${result.componentsChecked} components validated`);
            if (result.packageJsonChecked) {
                logger.important('  ✅ package.json valid');
            }
            logger.important('\nNo errors found.');
        }
    } else if (result.valid && result.warnings.length > 0) {
        logger.important(chalk.yellow('⚠️  Plugin validation passed with warnings\n'));
        logger.important('Warnings:');
        result.warnings.forEach((warning) => {
            logger.important(chalk.yellow(`  ⚠️  ${warning.message}`));
            if (warning.location) {
                logger.important(chalk.gray(`      Location: ${warning.location}`));
            }
            if (warning.suggestion) {
                logger.important(chalk.gray(`      → ${warning.suggestion}`));
            }
            logger.important('');
        });
        logger.important(chalk.gray('Use --strict to treat warnings as errors.'));
    } else {
        logger.important(chalk.red('❌ Plugin validation failed\n'));
        logger.important('Errors:');
        result.errors.forEach((error) => {
            logger.important(chalk.red(`  ❌ ${error.message}`));
            if (error.location) {
                logger.important(chalk.gray(`      Location: ${error.location}`));
            }
            if (error.suggestion) {
                logger.important(chalk.gray(`      → ${error.suggestion}`));
            }
            logger.important('');
        });
        logger.important(chalk.red(`${result.errors.length} errors found.`));
    }
}

/**
 * Pretty prints contract list
 */
function printContractList(index: ContractsIndex): void {
    const logger = getLogger();
    logger.important('\nAvailable Contracts:\n');

    // Group contracts by plugin
    const byPlugin = new Map<string, typeof index.contracts>();
    for (const contract of index.contracts) {
        const existing = byPlugin.get(contract.plugin) || [];
        existing.push(contract);
        byPlugin.set(contract.plugin, existing);
    }

    for (const [plugin, contracts] of byPlugin) {
        logger.important(chalk.bold(`📦 ${plugin}`));
        for (const contract of contracts) {
            const typeIcon = contract.type === 'static' ? '📄' : '⚡';
            logger.important(`   ${typeIcon} ${contract.name}`);
        }
        logger.important('');
    }

    if (index.contracts.length === 0) {
        logger.important(chalk.gray('No contracts found.'));
    }
}
