import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { loadPluginManifest } from '@jay-framework/compiler-shared';
import type { ValidatePluginOptions, ValidationResult, PluginContext } from './types';

/**
 * Validates a Jay Stack plugin package or local plugin directory.
 *
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export async function validatePlugin(
    options: ValidatePluginOptions = {},
): Promise<ValidationResult> {
    const pluginPath = options.pluginPath || process.cwd();

    if (options.local) {
        return validateLocalPlugins(pluginPath, options);
    } else {
        return validatePluginPackage(pluginPath, options);
    }
}

async function validatePluginPackage(
    pluginPath: string,
    options: ValidatePluginOptions,
): Promise<ValidationResult> {
    const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        contractsChecked: 0,
        componentsChecked: 0,
    };

    // 1. Load and validate plugin.yaml
    const pluginYamlPath = path.join(pluginPath, 'plugin.yaml');
    const pluginManifest = loadPluginManifest(pluginPath);

    if (!pluginManifest) {
        if (!fs.existsSync(pluginYamlPath)) {
            result.errors.push({
                type: 'file-missing',
                message: 'plugin.yaml not found',
                location: pluginPath,
                suggestion: 'Create a plugin.yaml file in the plugin root directory',
            });
        } else {
            result.errors.push({
                type: 'schema',
                message: 'Invalid YAML syntax or format',
                location: pluginYamlPath,
            });
        }
        result.valid = false;
        return result;
    }

    result.pluginName = pluginManifest.name;

    const context: PluginContext = {
        manifest: pluginManifest,
        pluginPath,
        isNpmPackage: fs.existsSync(path.join(pluginPath, 'package.json')),
    };

    // 2. Schema validation
    await validateSchema(context, result);

    // 3. Contract file validation
    if (pluginManifest.contracts) {
        for (let i = 0; i < pluginManifest.contracts.length; i++) {
            await validateContract(
                pluginManifest.contracts[i],
                i,
                context,
                options.generateTypes || false,
                result,
            );
        }
    }

    // 4. Component file validation
    if (pluginManifest.contracts) {
        for (let i = 0; i < pluginManifest.contracts.length; i++) {
            await validateComponent(pluginManifest.contracts[i], i, context, result);
        }
    }

    // 5. Package.json validation (if NPM package)
    if (context.isNpmPackage) {
        await validatePackageJson(context, result);
        result.packageJsonChecked = true;
    }

    // 6. Dynamic contracts validation
    if (pluginManifest.dynamic_contracts) {
        await validateDynamicContracts(context, result);
    }

    // Final result
    result.valid = result.errors.length === 0;

    return result;
}

async function validateLocalPlugins(
    projectPath: string,
    options: ValidatePluginOptions,
): Promise<ValidationResult> {
    const pluginsPath = path.join(projectPath, 'src/plugins');

    if (!fs.existsSync(pluginsPath)) {
        return {
            valid: false,
            errors: [
                {
                    type: 'file-missing',
                    message: 'src/plugins/ directory not found',
                    location: projectPath,
                    suggestion: 'Create src/plugins/ directory for local plugins',
                },
            ],
            warnings: [],
        };
    }

    // Validate each plugin in src/plugins/
    const pluginDirs = fs
        .readdirSync(pluginsPath, { withFileTypes: true })
        .filter((d) => d.isDirectory());

    const allResults: ValidationResult[] = [];

    for (const pluginDir of pluginDirs) {
        const pluginPath = path.join(pluginsPath, pluginDir.name);
        const result = await validatePluginPackage(pluginPath, options);
        allResults.push(result);
    }

    // Combine results
    return {
        valid: allResults.every((r) => r.valid),
        errors: allResults.flatMap((r) => r.errors),
        warnings: allResults.flatMap((r) => r.warnings),
        contractsChecked: allResults.reduce((sum, r) => sum + (r.contractsChecked || 0), 0),
        componentsChecked: allResults.reduce((sum, r) => sum + (r.componentsChecked || 0), 0),
        typesGenerated: allResults.reduce((sum, r) => sum + (r.typesGenerated || 0), 0),
    };
}

/**
 * Validates plugin.yaml schema - ensures required fields are present
 */
async function validateSchema(context: PluginContext, result: ValidationResult): Promise<void> {
    const { manifest } = context;

    // Check required field: name
    if (!manifest.name) {
        result.errors.push({
            type: 'schema',
            message: 'Missing required field: name',
            location: 'plugin.yaml',
            suggestion: 'Add a "name" field with a kebab-case plugin name',
        });
    } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name)) {
        result.errors.push({
            type: 'schema',
            message: `Invalid plugin name: "${manifest.name}". Must be kebab-case.`,
            location: 'plugin.yaml',
            suggestion: 'Use lowercase letters, numbers, and hyphens only (e.g., "my-plugin")',
        });
    }

    // Check contracts if present
    if (manifest.contracts) {
        if (!Array.isArray(manifest.contracts)) {
            result.errors.push({
                type: 'schema',
                message: 'Field "contracts" must be an array',
                location: 'plugin.yaml',
            });
        } else {
            manifest.contracts.forEach((contract, index) => {
                if (!contract.name) {
                    result.errors.push({
                        type: 'schema',
                        message: `Contract at index ${index} is missing "name" field`,
                        location: 'plugin.yaml',
                    });
                }
                if (!contract.contract) {
                    result.errors.push({
                        type: 'schema',
                        message: `Contract "${contract.name || index}" is missing "contract" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify path to .jay-contract file',
                    });
                }
                if (!contract.component) {
                    result.errors.push({
                        type: 'schema',
                        message: `Contract "${contract.name || index}" is missing "component" field`,
                        location: 'plugin.yaml',
                        suggestion:
                            'Specify the exported member name from the module (e.g., "moodTracker")',
                    });
                }
                // Validate slugs field if present
                if (contract.slugs !== undefined) {
                    if (!Array.isArray(contract.slugs)) {
                        result.errors.push({
                            type: 'schema',
                            message: `Contract "${contract.name || index}" has invalid "slugs" field - must be an array`,
                            location: 'plugin.yaml',
                            suggestion:
                                'Provide slugs as an array of strings, e.g., ["productId", "userId"]',
                        });
                    } else {
                        contract.slugs.forEach((slug: any, slugIndex: number) => {
                            if (typeof slug !== 'string') {
                                result.errors.push({
                                    type: 'schema',
                                    message: `Contract "${contract.name || index}" has invalid slug at index ${slugIndex} - must be a string`,
                                    location: 'plugin.yaml',
                                    suggestion:
                                        'All slugs must be strings representing dynamic URL parameters',
                                });
                            } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(slug)) {
                                result.errors.push({
                                    type: 'schema',
                                    message: `Contract "${contract.name || index}" has invalid slug "${slug}" - must be a valid identifier`,
                                    location: 'plugin.yaml',
                                    suggestion:
                                        'Slugs must start with a letter and contain only letters, numbers, and underscores (e.g., "productId", "user_id")',
                                });
                            }
                        });
                    }
                }
            });
        }
    }

    // Check dynamic_contracts if present
    if (manifest.dynamic_contracts) {
        // Normalize to array
        const dynamicConfigs = Array.isArray(manifest.dynamic_contracts)
            ? manifest.dynamic_contracts
            : [manifest.dynamic_contracts];

        for (const config of dynamicConfigs) {
            const prefix = config.prefix || '(unknown)';
            if (!config.component) {
                result.errors.push({
                    type: 'schema',
                    message: `dynamic_contracts[${prefix}] is missing "component" field`,
                    location: 'plugin.yaml',
                    suggestion: 'Specify path to shared component for dynamic contracts',
                });
            }
            if (!config.generator) {
                result.errors.push({
                    type: 'schema',
                    message: `dynamic_contracts[${prefix}] is missing "generator" field`,
                    location: 'plugin.yaml',
                    suggestion: 'Specify path to generator file or export name',
                });
            }
            if (!config.prefix) {
                result.errors.push({
                    type: 'schema',
                    message: 'dynamic_contracts entry is missing "prefix" field',
                    location: 'plugin.yaml',
                    suggestion: 'Specify prefix for dynamic contract names (e.g., "cms")',
                });
            }
        }
    }

    // Warn if neither contracts nor dynamic_contracts are specified
    if (!manifest.contracts && !manifest.dynamic_contracts) {
        result.warnings.push({
            type: 'schema',
            message: 'Plugin has no contracts or dynamic_contracts defined',
            location: 'plugin.yaml',
            suggestion: 'Add either "contracts" or "dynamic_contracts" to expose functionality',
        });
    }
}

/**
 * Validates a single contract definition
 */
async function validateContract(
    contract: any,
    index: number,
    context: PluginContext,
    generateTypes: boolean,
    result: ValidationResult,
): Promise<void> {
    result.contractsChecked = (result.contractsChecked || 0) + 1;

    let contractPath: string;

    if (context.isNpmPackage) {
        // For NPM packages, contract should be an export subpath (e.g., "mood-tracker.jay-contract")
        // Check if the file exists in common locations
        const contractSpec = contract.contract;
        const possiblePaths = [
            path.join(context.pluginPath, 'dist', contractSpec),
            path.join(context.pluginPath, 'lib', contractSpec),
            path.join(context.pluginPath, contractSpec),
        ];

        let found = false;
        for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
                contractPath = possiblePath;
                found = true;
                break;
            }
        }

        if (!found) {
            result.errors.push({
                type: 'file-missing',
                message: `Contract file not found: ${contractSpec}`,
                location: `plugin.yaml contracts[${index}]`,
                suggestion: `Ensure the contract file exists (looked in dist/, lib/, and root)`,
            });
            return;
        }
    } else {
        // For local plugins, contract is a relative path
        contractPath = path.join(context.pluginPath, contract.contract);

        // Check if contract file exists
        if (!fs.existsSync(contractPath)) {
            result.errors.push({
                type: 'file-missing',
                message: `Contract file not found: ${contract.contract}`,
                location: `plugin.yaml contracts[${index}]`,
                suggestion: `Create the contract file at ${contractPath}`,
            });
            return;
        }
    }

    // Validate contract file is valid YAML
    try {
        const contractContent = await fs.promises.readFile(contractPath, 'utf-8');
        const parsedContract = YAML.parse(contractContent);

        // Basic contract structure validation
        if (!parsedContract.name) {
            result.errors.push({
                type: 'contract-invalid',
                message: `Contract file ${contract.contract} is missing "name" field`,
                location: contractPath,
            });
        }

        if (!parsedContract.tags || !Array.isArray(parsedContract.tags)) {
            result.errors.push({
                type: 'contract-invalid',
                message: `Contract file ${contract.contract} is missing "tags" array`,
                location: contractPath,
            });
        }
    } catch (error: any) {
        result.errors.push({
            type: 'contract-invalid',
            message: `Invalid contract YAML: ${error.message}`,
            location: contractPath,
            suggestion: 'Check YAML syntax and ensure it follows Jay contract format',
        });
        return;
    }

    // Generate .d.ts file if requested
    if (generateTypes) {
        try {
            // Import compiler dynamically to generate types
            const { compileContractFile } = await import('@jay-framework/compiler-jay-html');
            const dtsPath = contractPath + '.d.ts';

            await compileContractFile(contractPath, dtsPath);

            result.typesGenerated = (result.typesGenerated || 0) + 1;
        } catch (error: any) {
            result.errors.push({
                type: 'type-generation-failed',
                message: `Failed to generate types for ${contract.contract}: ${error.message}`,
                location: contractPath,
            });
        }
    }
}

/**
 * Validates that component export name is valid
 */
async function validateComponent(
    contract: any,
    index: number,
    context: PluginContext,
    result: ValidationResult,
): Promise<void> {
    result.componentsChecked = (result.componentsChecked || 0) + 1;

    // For NPM packages, component is just the export name (e.g., "moodTracker")
    // For local plugins, it's also just the export name
    // We can't really validate the export exists without loading the module,
    // but we can check the format

    if (typeof contract.component !== 'string' || contract.component.length === 0) {
        result.errors.push({
            type: 'schema',
            message: `Invalid component name: ${contract.component}`,
            location: `plugin.yaml contracts[${index}]`,
            suggestion: 'Component should be the exported member name (e.g., "moodTracker")',
        });
    }

    // Warn if component name looks like a path instead of an export name
    if (contract.component.includes('/') || contract.component.includes('.')) {
        result.warnings.push({
            type: 'schema',
            message: `Component "${contract.component}" looks like a path. Should it be an export name?`,
            location: `plugin.yaml contracts[${index}]`,
            suggestion:
                'Component should be the exported member name (e.g., "moodTracker"), not a file path',
        });
    }
}

/**
 * Validates package.json has correct exports for NPM packages
 */
async function validatePackageJson(
    context: PluginContext,
    result: ValidationResult,
): Promise<void> {
    const packageJsonPath = path.join(context.pluginPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        result.warnings.push({
            type: 'file-missing',
            message: 'package.json not found',
            location: context.pluginPath,
            suggestion: 'Create a package.json file for NPM package distribution',
        });
        return;
    }

    try {
        const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8'));

        // Check for exports field
        if (!packageJson.exports) {
            result.warnings.push({
                type: 'export-mismatch',
                message: 'package.json missing "exports" field',
                location: packageJsonPath,
                suggestion: 'Add exports field to define entry points for server/client builds',
            });
        } else {
            // Check for main entry points
            if (!packageJson.exports['.']) {
                result.warnings.push({
                    type: 'export-mismatch',
                    message: 'package.json exports missing "." entry point',
                    location: packageJsonPath,
                    suggestion: 'Add "." export for the main module entry',
                });
            }

            // Check for contract exports if contracts are defined
            if (context.manifest.contracts) {
                for (const contract of context.manifest.contracts) {
                    // Contract should be an export subpath (e.g., "mood-tracker.jay-contract")
                    // Prepend "./" to create the export key
                    const contractExport = './' + contract.contract;

                    if (!packageJson.exports[contractExport]) {
                        result.errors.push({
                            type: 'export-mismatch',
                            message: `Contract "${contract.name}" not exported in package.json`,
                            location: packageJsonPath,
                            suggestion: `Add "${contractExport}": "./dist/${contract.contract}" to exports field`,
                        });
                    }
                }
            }

            // Check for main export (required for NPM packages, even when module is not specified)
            if (!packageJson.exports['.']) {
                result.errors.push({
                    type: 'export-mismatch',
                    message: 'NPM package missing "." export in package.json',
                    location: packageJsonPath,
                    suggestion: 'Add ".": "./dist/index.js" (or your main file) to exports field',
                });
            }

            // If module is explicitly specified, validate it
            if (context.manifest.module) {
                const moduleName = context.manifest.module;
                result.warnings.push({
                    type: 'schema',
                    message:
                        'NPM packages should omit the "module" field - the package main export will be used',
                    location: 'plugin.yaml',
                    suggestion: 'Remove the "module" field from plugin.yaml',
                });
            }
        }

        // Check for plugin.yaml export (required for plugin resolution)
        if (!packageJson.exports || !packageJson.exports['./plugin.yaml']) {
            result.errors.push({
                type: 'export-mismatch',
                message:
                    'plugin.yaml not exported in package.json (required for plugin resolution)',
                location: packageJsonPath,
                suggestion: 'Add "./plugin.yaml": "./plugin.yaml" to exports field',
            });
        }
    } catch (error: any) {
        result.errors.push({
            type: 'schema',
            message: `Invalid package.json: ${error.message}`,
            location: packageJsonPath,
        });
    }
}

/**
 * Validates dynamic contracts configuration
 */
async function validateDynamicContracts(
    context: PluginContext,
    result: ValidationResult,
): Promise<void> {
    const { dynamic_contracts } = context.manifest;
    if (!dynamic_contracts) return;

    // Normalize to array
    const dynamicConfigs = Array.isArray(dynamic_contracts)
        ? dynamic_contracts
        : [dynamic_contracts];

    for (const config of dynamicConfigs) {
        const prefix = config.prefix || '(unknown)';

        // Check generator - can be file path or export name
        if (config.generator) {
            // If it looks like a file path (starts with ./ or contains extension)
            const isFilePath =
                config.generator.startsWith('./') ||
                config.generator.startsWith('/') ||
                config.generator.includes('.ts') ||
                config.generator.includes('.js');

            if (isFilePath) {
                const generatorPath = path.join(context.pluginPath, config.generator);
                const possibleExtensions = ['', '.ts', '.js', '/index.ts', '/index.js'];

                let found = false;
                for (const ext of possibleExtensions) {
                    if (fs.existsSync(generatorPath + ext)) {
                        found = true;
                        break;
                    }
                }

                if (!found && !context.isNpmPackage) {
                    result.errors.push({
                        type: 'file-missing',
                        message: `Generator file not found for ${prefix}: ${config.generator}`,
                        location: 'plugin.yaml dynamic_contracts',
                        suggestion: `Create generator file at ${generatorPath}.ts`,
                    });
                }
            }
            // If it's an export name, we can't easily validate it exists
        }

        // Check component - can be file path or export name
        if (config.component) {
            const isFilePath =
                config.component.startsWith('./') ||
                config.component.startsWith('/') ||
                config.component.includes('.ts') ||
                config.component.includes('.js');

            if (isFilePath) {
                const componentPath = path.join(context.pluginPath, config.component);
                const possibleExtensions = ['', '.ts', '.js', '/index.ts', '/index.js'];

                let found = false;
                for (const ext of possibleExtensions) {
                    if (fs.existsSync(componentPath + ext)) {
                        found = true;
                        break;
                    }
                }

                if (!found && !context.isNpmPackage) {
                    result.errors.push({
                        type: 'file-missing',
                        message: `Dynamic contracts component not found for ${prefix}: ${config.component}`,
                        location: 'plugin.yaml dynamic_contracts',
                        suggestion: `Create component file at ${componentPath}.ts`,
                    });
                }
            }
        }
    }
}
