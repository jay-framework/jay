import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { loadPluginManifest } from '@jay-framework/compiler-shared';
import type { ValidatePluginOptions, ValidationResult, PluginContext, ExtendedPluginManifest } from './types';

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
        manifest: pluginManifest as ExtendedPluginManifest,
        pluginPath,
        isNpmPackage: fs.existsSync(path.join(pluginPath, 'package.json')),
    };

    // 2. Schema validation
    await validateSchema(context, result);

    // 3. Contract file validation - NEW pages structure
    if ((pluginManifest as ExtendedPluginManifest).pages) {
        const pages = (pluginManifest as ExtendedPluginManifest).pages!;
        for (let i = 0; i < pages.length; i++) {
            await validatePage(
                pages[i],
                i,
                context,
                options.generateTypes || false,
                result,
            );
        }
    }

    // 4. Contract file validation - NEW components structure
    if ((pluginManifest as ExtendedPluginManifest).components) {
        const components = (pluginManifest as ExtendedPluginManifest).components!;
        for (let i = 0; i < components.length; i++) {
            await validateComponentContract(
                components[i],
                i,
                context,
                options.generateTypes || false,
                result,
            );
        }
    }

    // 5. Contract file validation - LEGACY contracts structure
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

    // 6. Component file validation - NEW pages structure
    if ((pluginManifest as ExtendedPluginManifest).pages) {
        const pages = (pluginManifest as ExtendedPluginManifest).pages!;
        for (let i = 0; i < pages.length; i++) {
            await validateComponent(pages[i], i, context, result, 'pages');
        }
    }

    // 7. Component file validation - NEW components structure
    if ((pluginManifest as ExtendedPluginManifest).components) {
        const components = (pluginManifest as ExtendedPluginManifest).components!;
        for (let i = 0; i < components.length; i++) {
            await validateComponent(components[i], i, context, result, 'components');
        }
    }

    // 8. Component file validation - LEGACY contracts structure
    if (pluginManifest.contracts) {
        for (let i = 0; i < pluginManifest.contracts.length; i++) {
            await validateComponent(pluginManifest.contracts[i], i, context, result, 'contracts');
        }
    }

    // 9. Package.json validation (if NPM package)
    if (context.isNpmPackage) {
        await validatePackageJson(context, result);
        result.packageJsonChecked = true;
    }

    // 10. Dynamic contracts validation
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
    const manifest = context.manifest as ExtendedPluginManifest;

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

    // Check pages if present
    if (manifest.pages) {
        if (!Array.isArray(manifest.pages)) {
            result.errors.push({
                type: 'schema',
                message: 'Field "pages" must be an array',
                location: 'plugin.yaml',
            });
        } else {
            manifest.pages.forEach((page, index) => {
                if (!page.name) {
                    result.errors.push({
                        type: 'schema',
                        message: `Page at index ${index} is missing "name" field`,
                        location: 'plugin.yaml',
                    });
                }
                if (!page.contract) {
                    result.errors.push({
                        type: 'schema',
                        message: `Page "${page.name || index}" is missing "contract" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify path to .jay-contract file',
                    });
                }
                if (!page.component) {
                    result.errors.push({
                        type: 'schema',
                        message: `Page "${page.name || index}" is missing "component" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify the exported member name from the module (e.g., "productPage")',
                    });
                }

                // Validate slugs if present
                if (page.slugs !== undefined) {
                    if (!Array.isArray(page.slugs)) {
                        result.errors.push({
                            type: 'schema',
                            message: `Page "${page.name || index}" has invalid "slugs" field - must be an array`,
                            location: 'plugin.yaml',
                            suggestion: 'Use array format: ["productId", "categoryId"]',
                        });
                    } else {
                        page.slugs.forEach((slug, slugIndex) => {
                            if (typeof slug !== 'string') {
                                result.errors.push({
                                    type: 'schema',
                                    message: `Page "${page.name || index}" slug at index ${slugIndex} must be a string`,
                                    location: 'plugin.yaml',
                                });
                            } else if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(slug)) {
                                result.errors.push({
                                    type: 'schema',
                                    message: `Page "${page.name || index}" has invalid slug "${slug}" - must be valid identifier`,
                                    location: 'plugin.yaml',
                                    suggestion: 'Use camelCase identifiers (e.g., "productId", "categoryId")',
                                });
                            }
                        });

                        // Check for duplicate slugs
                        const duplicateSlugs = page.slugs.filter((slug, index, arr) => 
                            arr.indexOf(slug) !== index
                        );
                        if (duplicateSlugs.length > 0) {
                            result.errors.push({
                                type: 'schema',
                                message: `Page "${page.name || index}" has duplicate slugs: ${duplicateSlugs.join(', ')}`,
                                location: 'plugin.yaml',
                                suggestion: 'Remove duplicate slug names',
                            });
                        }
                    }
                }
            });
        }
    }

    // Check components if present
    if (manifest.components) {
        if (!Array.isArray(manifest.components)) {
            result.errors.push({
                type: 'schema',
                message: 'Field "components" must be an array',
                location: 'plugin.yaml',
            });
        } else {
            manifest.components.forEach((component, index) => {
                if (!component.name) {
                    result.errors.push({
                        type: 'schema',
                        message: `Component at index ${index} is missing "name" field`,
                        location: 'plugin.yaml',
                    });
                }
                if (!component.contract) {
                    result.errors.push({
                        type: 'schema',
                        message: `Component "${component.name || index}" is missing "contract" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify path to .jay-contract file',
                    });
                }
                if (!component.component) {
                    result.errors.push({
                        type: 'schema',
                        message: `Component "${component.name || index}" is missing "component" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify the exported member name from the module (e.g., "productCard")',
                    });
                }

                // Warn if component has slugs (components shouldn't have slugs)
                if ((component as any).slugs) {
                    result.warnings.push({
                        type: 'schema',
                        message: `Component "${component.name || index}" has "slugs" field - only pages should have slugs`,
                        location: 'plugin.yaml',
                        suggestion: 'Remove "slugs" field from components or move to "pages" section',
                    });
                }
            });
        }
    }

    // Check legacy contracts if present
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
            });
        }
    }

    // Check dynamic_contracts if present
    if (manifest.dynamic_contracts) {
        if (!manifest.dynamic_contracts.component) {
            result.errors.push({
                type: 'schema',
                message: 'dynamic_contracts is missing "component" field',
                location: 'plugin.yaml',
                suggestion: 'Specify path to shared component for dynamic contracts',
            });
        }
        if (!manifest.dynamic_contracts.generator) {
            result.errors.push({
                type: 'schema',
                message: 'dynamic_contracts is missing "generator" field',
                location: 'plugin.yaml',
                suggestion: 'Specify path to generator file',
            });
        }
        if (!manifest.dynamic_contracts.prefix) {
            result.errors.push({
                type: 'schema',
                message: 'dynamic_contracts is missing "prefix" field',
                location: 'plugin.yaml',
                suggestion: 'Specify prefix for dynamic contract names (e.g., "cms")',
            });
        }
    }

    // Warn if no contracts are specified (neither new nor legacy format)
    if (!manifest.pages && !manifest.components && !manifest.contracts && !manifest.dynamic_contracts) {
        result.warnings.push({
            type: 'schema',
            message: 'Plugin has no pages, components, contracts, or dynamic_contracts defined',
            location: 'plugin.yaml',
            suggestion: 'Add "pages", "components", "contracts", or "dynamic_contracts" to expose functionality',
        });
    }

    // Warn about mixing legacy and new formats
    if (manifest.contracts && (manifest.pages || manifest.components)) {
        result.warnings.push({
            type: 'schema',
            message: 'Plugin uses both legacy "contracts" and new "pages"/"components" format',
            location: 'plugin.yaml',
            suggestion: 'Consider migrating legacy "contracts" to "pages" or "components" for better organization',
        });
    }
}

/**
 * Validates a single contract definition (legacy format)
 */
async function validateContract(
    contract: any,
    index: number,
    context: PluginContext,
    generateTypes: boolean,
    result: ValidationResult,
): Promise<void> {
    // Reuse the common contract validation logic
    await validateContractFile(
        contract,
        index,
        context,
        generateTypes,
        result,
        'contracts'
    );
}

/**
 * Validates a page definition (new format)
 */
async function validatePage(
    page: any,
    index: number,
    context: PluginContext,
    generateTypes: boolean,
    result: ValidationResult,
): Promise<void> {
    // Reuse contract validation logic but with page-specific context
    await validateContractFile(
        page,
        index,
        context,
        generateTypes,
        result,
        'pages'
    );
}

/**
 * Validates a component definition (new format)
 */
async function validateComponentContract(
    component: any,
    index: number,
    context: PluginContext,
    generateTypes: boolean,
    result: ValidationResult,
): Promise<void> {
    // Reuse contract validation logic but with component-specific context
    await validateContractFile(
        component,
        index,
        context,
        generateTypes,
        result,
        'components'
    );
}

/**
 * Generic contract file validation (used by pages, components, and legacy contracts)
 */
async function validateContractFile(
    contract: any,
    index: number,
    context: PluginContext,
    generateTypes: boolean,
    result: ValidationResult,
    section: 'pages' | 'components' | 'contracts',
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
                location: `plugin.yaml ${section}[${index}]`,
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
                location: `plugin.yaml ${section}[${index}]`,
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
    section: 'pages' | 'components' | 'contracts' = 'contracts',
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
            location: `plugin.yaml ${section}[${index}]`,
            suggestion: 'Component should be the exported member name (e.g., "moodTracker")',
        });
    }

    // Warn if component name looks like a path instead of an export name
    if (contract.component.includes('/') || contract.component.includes('.')) {
        result.warnings.push({
            type: 'schema',
            message: `Component "${contract.component}" looks like a path. Should it be an export name?`,
            location: `plugin.yaml ${section}[${index}]`,
            suggestion:
                'Component should be the exported member name (e.g., "moodTracker"), not a file path',
        });
    }

    // Additional validation for pages with slugs
    if (section === 'pages' && contract.slugs && Array.isArray(contract.slugs) && contract.slugs.length > 0) {
        // Pages with slugs should follow naming conventions
        if (!contract.name.includes('page') && !contract.name.includes('Page')) {
            result.warnings.push({
                type: 'schema',
                message: `Page "${contract.name}" has slugs but name doesn't indicate it's a page`,
                location: `plugin.yaml ${section}[${index}]`,
                suggestion: 'Consider naming pages with "page" suffix (e.g., "product-page")',
            });
        }

        // Validate slug names are reasonable
        contract.slugs.forEach((slug: string, slugIndex: number) => {
            if (slug.length < 2) {
                result.warnings.push({
                    type: 'schema',
                    message: `Page "${contract.name}" slug "${slug}" is very short`,
                    location: `plugin.yaml ${section}[${index}]`,
                    suggestion: 'Use descriptive slug names (e.g., "productId" instead of "id")',
                });
            }
            
            // Check for common bad patterns
            if (['id', 'key', 'value'].includes(slug.toLowerCase())) {
                result.warnings.push({
                    type: 'schema',
                    message: `Page "${contract.name}" slug "${slug}" is too generic`,
                    location: `plugin.yaml ${section}[${index}]`,
                    suggestion: 'Use specific slug names (e.g., "productId" instead of "id")',
                });
            }
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

            // Check for contract exports - NEW pages format
            if (context.manifest.pages) {
                for (const page of context.manifest.pages) {
                    const contractExport = './' + page.contract;
                    if (!packageJson.exports[contractExport]) {
                        result.errors.push({
                            type: 'export-mismatch',
                            message: `Page contract "${page.name}" not exported in package.json`,
                            location: packageJsonPath,
                            suggestion: `Add "${contractExport}": "./dist/${page.contract}" to exports field`,
                        });
                    }
                }
            }

            // Check for contract exports - NEW components format
            if (context.manifest.components) {
                for (const component of context.manifest.components) {
                    const contractExport = './' + component.contract;
                    if (!packageJson.exports[contractExport]) {
                        result.errors.push({
                            type: 'export-mismatch',
                            message: `Component contract "${component.name}" not exported in package.json`,
                            location: packageJsonPath,
                            suggestion: `Add "${contractExport}": "./dist/${component.contract}" to exports field`,
                        });
                    }
                }
            }

            // Check for contract exports - LEGACY contracts format
            if (context.manifest.contracts) {
                for (const contract of context.manifest.contracts) {
                    // Contract should be an export subpath (e.g., "mood-tracker.jay-contract")
                    // Prepend "./" to create the export key
                    const contractExport = './' + contract.contract;

                    if (!packageJson.exports[contractExport]) {
                        result.errors.push({
                            type: 'export-mismatch',
                            message: `Legacy contract "${contract.name}" not exported in package.json`,
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

    // Check generator file exists
    if (dynamic_contracts.generator) {
        const generatorPath = path.join(context.pluginPath, dynamic_contracts.generator);
        const possibleExtensions = ['.ts', '.js', '/index.ts', '/index.js'];

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
                message: `Generator file not found: ${dynamic_contracts.generator}`,
                location: 'plugin.yaml dynamic_contracts',
                suggestion: `Create generator file at ${generatorPath}.ts`,
            });
        }
    }

    // Check component file exists
    if (dynamic_contracts.component) {
        const componentPath = path.join(context.pluginPath, dynamic_contracts.component);
        const possibleExtensions = ['.ts', '.js', '/index.ts', '/index.js'];

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
                message: `Dynamic contracts component not found: ${dynamic_contracts.component}`,
                location: 'plugin.yaml dynamic_contracts',
                suggestion: `Create component file at ${componentPath}.ts`,
            });
        }
    }
}
