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
import { setDevLogger, createDevLogger, type LogLevel } from '@jay-framework/logger';

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
            console.error(chalk.red('Error starting dev server:'), error.message);
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
                console.log(JSON.stringify({ valid: false, error: error.message }, null, 2));
            } else {
                console.error(chalk.red('Validation error:'), error.message);
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
            console.error(chalk.red('Validation error:'), error.message);
            process.exit(1);
        }
    });

// Contract materialization command
program
    .command('contracts')
    .description('Materialize and list available contracts from all plugins')
    .option('-o, --output <dir>', 'Output directory for materialized contracts')
    .option('--yaml', 'Output contract index as YAML to stdout')
    .option('--list', 'List contracts without writing files')
    .option('--plugin <name>', 'Filter to specific plugin')
    .option('--dynamic-only', 'Only process dynamic contracts')
    .option('--force', 'Force re-materialization')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (options) => {
        const projectRoot = process.cwd();
        let viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined;

        try {
            if (options.list) {
                // Just list, don't write files
                const index = await listContracts({
                    projectRoot,
                    dynamicOnly: options.dynamicOnly,
                    pluginFilter: options.plugin,
                });

                if (options.yaml) {
                    console.log(YAML.stringify(index));
                } else {
                    printContractList(index);
                }
                return;
            }

            // Create Vite server for TypeScript support
            if (options.verbose) {
                console.log('Starting Vite for TypeScript support...');
            }
            viteServer = await createViteForCli({ projectRoot });

            // Initialize services (needed for dynamic generators)
            const services = await initializeServicesForCli(projectRoot, viteServer);

            // Materialize contracts
            const result = await materializeContracts(
                {
                    projectRoot,
                    outputDir: options.output,
                    force: options.force,
                    dynamicOnly: options.dynamicOnly,
                    pluginFilter: options.plugin,
                    verbose: options.verbose,
                    viteServer,
                },
                services,
            );

            if (options.yaml) {
                console.log(YAML.stringify(result.index));
            } else {
                console.log(
                    chalk.green(`\n✅ Materialized ${result.index.contracts.length} contracts`),
                );
                console.log(`   Static: ${result.staticCount}`);
                console.log(`   Dynamic: ${result.dynamicCount}`);
                console.log(`   Output: ${result.outputDir}`);
            }
        } catch (error: any) {
            console.error(chalk.red('❌ Failed to materialize contracts:'), error.message);
            if (options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        } finally {
            // Clean up Vite server
            if (viteServer) {
                await viteServer.close();
            }
        }
    });

// Parse arguments
program.parse(process.argv);

/**
 * Initializes services for CLI use (loads init.ts and runs callbacks)
 *
 * Uses the provided Vite server for TypeScript transpilation when loading
 * init files and plugin modules.
 */
async function initializeServicesForCli(
    projectRoot: string,
    viteServer?: Awaited<ReturnType<typeof createViteForCli>>,
): Promise<Map<symbol, unknown>> {
    const path = await import('node:path');
    const fs = await import('node:fs');

    // Import service initialization functions
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
            console.warn(chalk.yellow(`⚠️  Plugin initialization skipped: ${error.message}`));
        }

        // Load project init.ts/js if it exists
        const initPathTs = path.join(projectRoot, 'src', 'init.ts');
        const initPathJs = path.join(projectRoot, 'src', 'init.js');

        let initModule: any;
        if (fs.existsSync(initPathTs) && viteServer) {
            // Use Vite for TypeScript transpilation
            initModule = await viteServer.ssrLoadModule(initPathTs);
        } else if (fs.existsSync(initPathJs)) {
            initModule = await import(initPathJs);
        }

        if (initModule?.init?._serverInit) {
            await initModule.init._serverInit();
        }

        // Run any additional init callbacks
        await runInitCallbacks();
    } catch (error: any) {
        console.warn(chalk.yellow(`⚠️  Service initialization failed: ${error.message}`));
        console.warn(chalk.gray('   Static contracts will still be listed.'));
    }

    return getServiceRegistry();
}

// If no command provided, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}

/**
 * Pretty prints validation results
 */
function printValidationResult(result: ValidationResult, verbose: boolean): void {
    if (result.valid && result.warnings.length === 0) {
        console.log(chalk.green('✅ Plugin validation successful!\n'));
        if (verbose) {
            console.log('Plugin:', result.pluginName);
            console.log('  ✅ plugin.yaml valid');
            console.log(`  ✅ ${result.contractsChecked} contracts validated`);
            if (result.typesGenerated) {
                console.log(`  ✅ ${result.typesGenerated} type definitions generated`);
            }
            console.log(`  ✅ ${result.componentsChecked} components validated`);
            if (result.packageJsonChecked) {
                console.log('  ✅ package.json valid');
            }
            console.log('\nNo errors found.');
        }
    } else if (result.valid && result.warnings.length > 0) {
        console.log(chalk.yellow('⚠️  Plugin validation passed with warnings\n'));
        console.log('Warnings:');
        result.warnings.forEach((warning) => {
            console.log(chalk.yellow(`  ⚠️  ${warning.message}`));
            if (warning.location) {
                console.log(chalk.gray(`      Location: ${warning.location}`));
            }
            if (warning.suggestion) {
                console.log(chalk.gray(`      → ${warning.suggestion}`));
            }
            console.log();
        });
        console.log(chalk.gray('Use --strict to treat warnings as errors.'));
    } else {
        console.log(chalk.red('❌ Plugin validation failed\n'));
        console.log('Errors:');
        result.errors.forEach((error) => {
            console.log(chalk.red(`  ❌ ${error.message}`));
            if (error.location) {
                console.log(chalk.gray(`      Location: ${error.location}`));
            }
            if (error.suggestion) {
                console.log(chalk.gray(`      → ${error.suggestion}`));
            }
            console.log();
        });
        console.log(chalk.red(`${result.errors.length} errors found.`));
    }
}

/**
 * Pretty prints contract list
 */
function printContractList(index: ContractsIndex): void {
    console.log('\nAvailable Contracts:\n');

    // Group contracts by plugin
    const byPlugin = new Map<string, typeof index.contracts>();
    for (const contract of index.contracts) {
        const existing = byPlugin.get(contract.plugin) || [];
        existing.push(contract);
        byPlugin.set(contract.plugin, existing);
    }

    for (const [plugin, contracts] of byPlugin) {
        console.log(chalk.bold(`📦 ${plugin}`));
        for (const contract of contracts) {
            const typeIcon = contract.type === 'static' ? '📄' : '⚡';
            console.log(`   ${typeIcon} ${contract.name}`);
        }
        console.log();
    }

    if (index.contracts.length === 0) {
        console.log(chalk.gray('No contracts found.'));
    }
}
