import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { PluginManifest } from '@jay-framework/editor-protocol';
import type { ValidatePluginOptions, ValidationResult, PluginContext } from './types';

/**
 * Validates a Jay Stack plugin package or local plugin directory.
 * 
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export async function validatePlugin(options: ValidatePluginOptions = {}): Promise<ValidationResult> {
    const pluginPath = options.pluginPath || process.cwd();
    
    if (options.local) {
        return validateLocalPlugins(pluginPath, options);
    } else {
        return validatePluginPackage(pluginPath, options);
    }
}

async function validatePluginPackage(
    pluginPath: string,
    options: ValidatePluginOptions
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
    if (!fs.existsSync(pluginYamlPath)) {
        result.errors.push({
            type: 'file-missing',
            message: 'plugin.yaml not found',
            location: pluginPath,
            suggestion: 'Create a plugin.yaml file in the plugin root directory',
        });
        result.valid = false;
        return result;
    }
    
    let pluginManifest: PluginManifest;
    try {
        const yamlContent = fs.readFileSync(pluginYamlPath, 'utf-8');
        pluginManifest = YAML.parse(yamlContent);
        result.pluginName = pluginManifest.name;
    } catch (error: any) {
        result.errors.push({
            type: 'schema',
            message: `Invalid YAML syntax: ${error.message}`,
            location: pluginYamlPath,
        });
        result.valid = false;
        return result;
    }
    
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
                result
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
    options: ValidatePluginOptions
): Promise<ValidationResult> {
    const pluginsPath = path.join(projectPath, 'src/plugins');
    
    if (!fs.existsSync(pluginsPath)) {
        return {
            valid: false,
            errors: [{
                type: 'file-missing',
                message: 'src/plugins/ directory not found',
                location: projectPath,
                suggestion: 'Create src/plugins/ directory for local plugins',
            }],
            warnings: [],
        };
    }
    
    // Validate each plugin in src/plugins/
    const pluginDirs = fs.readdirSync(pluginsPath, { withFileTypes: true })
        .filter(d => d.isDirectory());
    
    const allResults: ValidationResult[] = [];
    
    for (const pluginDir of pluginDirs) {
        const pluginPath = path.join(pluginsPath, pluginDir.name);
        const result = await validatePluginPackage(pluginPath, options);
        allResults.push(result);
    }
    
    // Combine results
    return {
        valid: allResults.every(r => r.valid),
        errors: allResults.flatMap(r => r.errors),
        warnings: allResults.flatMap(r => r.warnings),
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
                        suggestion: 'Specify path to component implementation',
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
    result: ValidationResult
): Promise<void> {
    result.contractsChecked = (result.contractsChecked || 0) + 1;
    
    const contractPath = path.join(context.pluginPath, contract.contract);
    
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
 * Validates that component file exists
 */
async function validateComponent(
    contract: any,
    index: number,
    context: PluginContext,
    result: ValidationResult
): Promise<void> {
    result.componentsChecked = (result.componentsChecked || 0) + 1;
    
    // For NPM packages, we can't easily validate exports without loading the package
    // So we'll just validate for local plugins
    if (!context.isNpmPackage) {
        const componentPath = contract.component;
        const possibleExtensions = ['.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js'];
        
        let found = false;
        for (const ext of possibleExtensions) {
            const fullPath = path.join(context.pluginPath, componentPath + ext);
            if (fs.existsSync(fullPath)) {
                found = true;
                break;
            }
        }
        
        if (!found) {
            result.errors.push({
                type: 'file-missing',
                message: `Component file not found: ${componentPath}`,
                location: `plugin.yaml contracts[${index}]`,
                suggestion: `Create a component file at ${componentPath}.ts or ${componentPath}/index.ts`,
            });
        }
    }
}

/**
 * Validates package.json has correct exports for NPM packages
 */
async function validatePackageJson(context: PluginContext, result: ValidationResult): Promise<void> {
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
                    const contractExport = `./contracts/${contract.name}.jay-contract`;
                    if (!packageJson.exports[contractExport]) {
                        result.warnings.push({
                            type: 'export-mismatch',
                            message: `Contract ${contract.name} not exported in package.json`,
                            location: packageJsonPath,
                            suggestion: `Add "${contractExport}" to exports field`,
                        });
                    }
                }
            }
        }
        
        // Check for plugin.yaml export
        if (!packageJson.exports || !packageJson.exports['./plugin.yaml']) {
            result.warnings.push({
                type: 'export-mismatch',
                message: 'plugin.yaml not exported in package.json',
                location: packageJsonPath,
                suggestion: 'Add "./plugin.yaml" to exports field',
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
async function validateDynamicContracts(context: PluginContext, result: ValidationResult): Promise<void> {
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

