import chalk from 'chalk';
import path from 'path';
import { promises as fsp } from 'fs';
import { glob } from 'glob';
import {
    JAY_CONTRACT_EXTENSION,
    JAY_EXTENSION,
    GenerateTarget,
    RuntimeMode,
} from '@jay-framework/compiler-shared';
import {
    parseJayFile,
    JAY_IMPORT_RESOLVER,
    generateElementFile,
    parseContract,
} from '@jay-framework/compiler-jay-html';
import { loadConfig, getConfigWithDefaults } from './config';

export interface ValidateOptions {
    path?: string;
    verbose?: boolean;
    json?: boolean;
}

export interface ValidationError {
    file: string;
    message: string;
    stage: 'parse' | 'generate';
}

export interface ValidationWarning {
    file: string;
    message: string;
}

export interface ValidationResult {
    valid: boolean;
    jayHtmlFilesScanned: number;
    contractFilesScanned: number;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

async function findJayFiles(dir: string): Promise<string[]> {
    return await glob(`${dir}/**/*${JAY_EXTENSION}`);
}

async function findContractFiles(dir: string): Promise<string[]> {
    return await glob(`${dir}/**/*${JAY_CONTRACT_EXTENSION}`);
}

export async function validateJayFiles(options: ValidateOptions = {}): Promise<ValidationResult> {
    const config = loadConfig();
    const resolvedConfig = getConfigWithDefaults(config);
    const projectRoot = process.cwd();

    // Use provided path or default to pagesBase from config
    const scanDir = options.path
        ? path.resolve(options.path)
        : path.resolve(resolvedConfig.devServer.pagesBase);

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Find all jay files
    const jayHtmlFiles = await findJayFiles(scanDir);
    const contractFiles = await findContractFiles(scanDir);

    if (options.verbose) {
        console.log(chalk.gray(`Scanning directory: ${scanDir}`));
        console.log(chalk.gray(`Found ${jayHtmlFiles.length} .jay-html files`));
        console.log(chalk.gray(`Found ${contractFiles.length} .jay-contract files\n`));
    }

    // Validate .jay-contract files first (they may be referenced by jay-html)
    for (const contractFile of contractFiles) {
        const relativePath = path.relative(projectRoot, contractFile);

        try {
            const content = await fsp.readFile(contractFile, 'utf-8');
            const result = parseContract(content, path.basename(contractFile));

            if (result.validations.length > 0) {
                for (const validation of result.validations) {
                    errors.push({
                        file: relativePath,
                        message: validation,
                        stage: 'parse',
                    });
                }
                if (options.verbose) {
                    console.log(chalk.red(`❌ ${relativePath}`));
                }
            } else if (options.verbose) {
                console.log(chalk.green(`✓ ${relativePath}`));
            }
        } catch (error: any) {
            errors.push({
                file: relativePath,
                message: error.message,
                stage: 'parse',
            });
            if (options.verbose) {
                console.log(chalk.red(`❌ ${relativePath}`));
            }
        }
    }

    // Validate .jay-html files
    for (const jayFile of jayHtmlFiles) {
        const relativePath = path.relative(projectRoot, jayFile);
        const filename = path.basename(jayFile.replace(JAY_EXTENSION, ''));
        const dirname = path.dirname(jayFile);

        try {
            // Parse the jay-html file
            const content = await fsp.readFile(jayFile, 'utf-8');
            const parsedFile = await parseJayFile(
                content,
                filename,
                dirname,
                {},
                JAY_IMPORT_RESOLVER,
                projectRoot,
            );

            if (parsedFile.validations.length > 0) {
                for (const validation of parsedFile.validations) {
                    errors.push({
                        file: relativePath,
                        message: validation,
                        stage: 'parse',
                    });
                }
                if (options.verbose) {
                    console.log(chalk.red(`❌ ${relativePath}`));
                }
                continue; // Skip generation if parsing failed
            }

            // Try to generate the code (without writing to disk)
            const generatedFile = generateElementFile(
                parsedFile.val!,
                RuntimeMode.MainTrusted,
                GenerateTarget.jay,
            );

            if (generatedFile.validations.length > 0) {
                for (const validation of generatedFile.validations) {
                    errors.push({
                        file: relativePath,
                        message: validation,
                        stage: 'generate',
                    });
                }
                if (options.verbose) {
                    console.log(chalk.red(`❌ ${relativePath}`));
                }
            } else if (options.verbose) {
                console.log(chalk.green(`✓ ${relativePath}`));
            }
        } catch (error: any) {
            errors.push({
                file: relativePath,
                message: error.message,
                stage: 'parse',
            });
            if (options.verbose) {
                console.log(chalk.red(`❌ ${relativePath}`));
            }
        }
    }

    return {
        valid: errors.length === 0,
        jayHtmlFilesScanned: jayHtmlFiles.length,
        contractFilesScanned: contractFiles.length,
        errors,
        warnings,
    };
}

export function printJayValidationResult(result: ValidationResult, options: ValidateOptions): void {
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log('');

    if (result.valid) {
        console.log(chalk.green('✅ Jay Stack validation successful!\n'));
        console.log(
            `Scanned ${result.jayHtmlFilesScanned} .jay-html files, ${result.contractFilesScanned} .jay-contract files`,
        );
        console.log('No errors found.');
    } else {
        console.log(chalk.red('❌ Jay Stack validation failed\n'));
        console.log('Errors:');

        for (const error of result.errors) {
            console.log(chalk.red(`  ❌ ${error.file}`));
            console.log(chalk.gray(`     ${error.message}`));
            console.log('');
        }

        const validFiles =
            result.jayHtmlFilesScanned + result.contractFilesScanned - result.errors.length;
        console.log(
            chalk.red(`${result.errors.length} error(s) found, ${validFiles} file(s) valid.`),
        );
    }
}
