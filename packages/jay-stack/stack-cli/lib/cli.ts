import { Command } from 'commander';
import chalk from 'chalk';
import { getLogger } from '@jay-framework/logger';
import { initializeServicesForCli } from './cli-services';
import { runDev } from './run-dev';
import { runBuild, runServe, runRebuild } from './run-production';
import { runValidate, runValidatePlugin } from './run-validate';
import { runAgentKit } from './run-agent-kit';
import { runAction } from './run-action';
import { runParams } from './run-params';
import { runSetup } from './run-setup';

const program = new Command();

program
    .name('jay-stack')
    .description('Jay Stack CLI - Development server and plugin validation')
    .version('0.9.0');

program
    .command('dev')
    .description('Start the Jay Stack development server')
    .option('-p, --path <path>', 'Project root (default: cwd)')
    .option('-v, --verbose', 'Enable verbose logging output')
    .option('-q, --quiet', 'Suppress all non-error output')
    .option('--test-mode', 'Enable test endpoints (/_jay/health, /_jay/shutdown)')
    .option('--timeout <seconds>', 'Auto-shutdown after N seconds (implies --test-mode)', parseInt)
    .action(async (options) => {
        try {
            await runDev(options.path, options);
        } catch (error: any) {
            getLogger().error(chalk.red('Error starting dev server:') + ' ' + error.message);
            process.exit(1);
        }
    });

program
    .command('build')
    .description('Build production artifacts')
    .option('-p, --path <path>', 'Project root (default: cwd)')
    .option('--version <n>', 'Build version number (default: from package.json)')
    .option('--no-minify', 'Disable minification (useful for debugging)')
    .option('-v, --verbose', 'Enable verbose logging output')
    .action(async (options) => {
        try {
            await runBuild(options.path, options);
        } catch (error: any) {
            getLogger().error(chalk.red('Build failed:') + ' ' + error.message);
            if (error.stack) getLogger().error(error.stack);
            process.exit(1);
        }
    });

program
    .command('serve')
    .description('Start production server')
    .option('-p, --path <path>', 'Project root (default: cwd)')
    .option('--version <n>', 'Build version to serve (default: from package.json)')
    .option('--port <n>', 'Port number', '3000')
    .option('--role <role>', 'Server role: main (default) or renderer', 'main')
    .option('-v, --verbose', 'Enable verbose logging output')
    .action(async (options) => {
        try {
            await runServe(options.path, options);
        } catch (error: any) {
            getLogger().error(chalk.red('Server failed:') + ' ' + error.message);
            if (error.stack) getLogger().error(error.stack);
            process.exit(1);
        }
    });

program
    .command('rebuild <contract>')
    .description('Rebuild instances for a contract (e.g., jay-stack rebuild product-page)')
    .option('--params <json>', 'JSON params to rebuild specific instance (e.g., \'{"slug":"x"}\')')
    .option('--version <n>', 'Build version (default: from package.json)')
    .option('-p, --path <path>', 'Project root (default: cwd)')
    .option('-v, --verbose', 'Enable verbose logging output')
    .action(async (contract, options) => {
        try {
            await runRebuild(options.path, { ...options, contract });
        } catch (error: any) {
            getLogger().error(chalk.red('Rebuild failed:') + ' ' + error.message);
            if (error.stack) getLogger().error(error.stack);
            process.exit(1);
        }
    });

program
    .command('validate')
    .description('Validate all .jay-html and .jay-contract files')
    .option('-p, --path <path>', 'Scan root (default: cwd)')
    .option('-v, --verbose', 'Show per-file validation status')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
        try {
            await runValidate(options.path, options);
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

program
    .command('validate-plugin')
    .description('Validate a Jay Stack plugin package')
    .option('-p, --path <path>', 'Plugin root (default: cwd)')
    .option('--local', 'Validate local plugins in src/plugins/')
    .option('-v, --verbose', 'Show detailed validation output')
    .option('--strict', 'Treat warnings as errors (for CI)')
    .option('--generate-types', 'Generate .d.ts files for contracts')
    .action(async (options) => {
        try {
            await runValidatePlugin(options.path, options);
        } catch (error: any) {
            getLogger().error(chalk.red('Validation error:') + ' ' + error.message);
            process.exit(1);
        }
    });

program
    .command('setup [plugin]')
    .description('Run plugin setup: config templates, credential validation, reference data')
    .option('--force', 'Force re-run (overwrite config templates and regenerate references)')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (plugin: string | undefined, options) => {
        await runSetup(plugin, options, process.cwd(), initializeServicesForCli);
    });

program
    .command('agent-kit')
    .description('Prepare agent kit: materialize contracts, generate references, write docs')
    .option('-o, --output <dir>', 'Output directory (default: agent-kit/materialized-contracts)')
    .option('--yaml', 'Output contract index as YAML to stdout')
    .option('--list', 'List contracts without writing files')
    .option('--plugin <name>', 'Filter to specific plugin')
    .option('--dynamic-only', 'Only process dynamic contracts')
    .option('--force', 'Force re-materialization')
    .option('--no-references', 'Skip reference data generation')
    .option(
        '-m, --mode <role>',
        'Generate guides for a specific role: designer, developer, or plugin (default: all)',
    )
    .option('-v, --verbose', 'Show detailed output')
    .action(async (options) => {
        await runAgentKit(options);
    });

program
    .command('action <plugin/action>')
    .description('Run a plugin action (e.g., jay-stack action wix-stores/searchProducts)')
    .option('--input <json>', 'JSON input for the action (default: {})')
    .option('--yaml', 'Output result as YAML instead of JSON')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (actionRef: string, options) => {
        await runAction(actionRef, options, process.cwd(), initializeServicesForCli);
    });

program
    .command('params <plugin/contract>')
    .description('Discover load param values for a contract (NDJSON or YAML)')
    .option('--yaml', 'Output as YAML instead of NDJSON')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (contractRef: string, options) => {
        await runParams(contractRef, options, process.cwd(), initializeServicesForCli);
    });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}