import chalk from 'chalk';
import { validatePlugin, type ValidationResult } from '@jay-framework/plugin-validator';
import { validateJayFiles, printJayValidationResult } from './validate';
import { getLogger } from '@jay-framework/logger';

export async function runValidate(
    scanPath: string | undefined,
    options: { verbose?: boolean; json?: boolean },
): Promise<void> {
    const result = await validateJayFiles({
        path: scanPath,
        verbose: options.verbose,
        json: options.json,
    });

    printJayValidationResult(result, options);

    if (!result.valid) {
        process.exit(1);
    }
}

export async function runValidatePlugin(
    pluginPath: string | undefined,
    options: { local?: boolean; verbose?: boolean; strict?: boolean; generateTypes?: boolean },
): Promise<void> {
    const result = await validatePlugin({
        pluginPath: pluginPath || process.cwd(),
        local: options.local,
        verbose: options.verbose,
        strict: options.strict,
        generateTypes: options.generateTypes,
    });

    printPluginValidationResult(result, options.verbose ?? false);

    if (!result.valid || (options.strict && result.warnings.length > 0)) {
        process.exit(1);
    }
}

function printPluginValidationResult(result: ValidationResult, verbose: boolean): void {
    const logger = getLogger();
    if (result.valid && result.warnings.length === 0) {
        logger.important(chalk.green('Plugin validation successful!\n'));
        if (verbose) {
            logger.important('Plugin: ' + result.pluginName);
            logger.important('  plugin.yaml valid');
            logger.important(`  ${result.contractsChecked} contracts validated`);
            if (result.typesGenerated) {
                logger.important(`  ${result.typesGenerated} type definitions generated`);
            }
            logger.important(`  ${result.componentsChecked} components validated`);
            if (result.packageJsonChecked) {
                logger.important('  package.json valid');
            }
            logger.important('\nNo errors found.');
        }
    } else if (result.valid && result.warnings.length > 0) {
        logger.important(chalk.yellow('Plugin validation passed with warnings\n'));
        logger.important('Warnings:');
        result.warnings.forEach((warning) => {
            logger.important(chalk.yellow(`  ${warning.message}`));
            if (warning.location) {
                logger.important(chalk.gray(`      Location: ${warning.location}`));
            }
            if (warning.suggestion) {
                logger.important(chalk.gray(`      ${warning.suggestion}`));
            }
            logger.important('');
        });
        logger.important(chalk.gray('Use --strict to treat warnings as errors.'));
    } else {
        logger.important(chalk.red('Plugin validation failed\n'));
        logger.important('Errors:');
        result.errors.forEach((error) => {
            logger.important(chalk.red(`  ${error.message}`));
            if (error.location) {
                logger.important(chalk.gray(`      Location: ${error.location}`));
            }
            if (error.suggestion) {
                logger.important(chalk.gray(`      ${error.suggestion}`));
            }
            logger.important('');
        });
        logger.important(chalk.red(`${result.errors.length} errors found.`));
    }
}
