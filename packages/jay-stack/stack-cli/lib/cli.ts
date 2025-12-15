import { Command } from 'commander';
import chalk from 'chalk';
import { validatePlugin, type ValidationResult } from '@jay-framework/plugin-validator';
import { startDevServer } from './server';

const program = new Command();

program
    .name('jay-stack')
    .description('Jay Stack CLI - Development server and plugin validation')
    .version('0.9.0');

// Dev server command (existing functionality)
program
    .command('dev [path]')
    .description('Start the Jay Stack development server')
    .action(async (path, options) => {
        try {
            await startDevServer({
                projectPath: path || process.cwd(),
            });
        } catch (error: any) {
            console.error(chalk.red('Error starting dev server:'), error.message);
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

