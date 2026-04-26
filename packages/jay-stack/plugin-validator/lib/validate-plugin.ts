import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { loadPluginManifest } from '@jay-framework/compiler-shared';
import { parseContract } from '@jay-framework/compiler-jay-html';
import { ts } from '@jay-framework/typescript-bridge';
import type { ValidatePluginOptions, ValidationResult, PluginContext } from './types';
import { checkComponentPropsAndParams } from './check-component-contract';

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
 * Validate a doc file reference — check file exists and (for NPM) is exported.
 */
function validateDocFile(
    docPath: string,
    label: string,
    context: PluginContext,
    result: ValidationResult,
): void {
    const resolvedPath = path.join(context.pluginPath, docPath);
    if (!fs.existsSync(resolvedPath)) {
        result.errors.push({
            type: 'file-missing',
            message: `Doc file for ${label} not found: ${docPath}`,
            location: 'plugin.yaml',
            suggestion: `Create the documentation file at ${resolvedPath}`,
        });
        return;
    }

    // For NPM packages, check the doc is exported in package.json
    if (context.isNpmPackage) {
        const packageJsonPath = path.join(context.pluginPath, 'package.json');
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            if (packageJson.exports) {
                const exportKey = './' + docPath.replace(/^\.\//, '');
                if (!packageJson.exports[exportKey]) {
                    result.errors.push({
                        type: 'export-mismatch',
                        message: `Doc file for ${label} is not exported in package.json: ${docPath}`,
                        location: packageJsonPath,
                        suggestion: `Add "${exportKey}": "${docPath}" to the exports field`,
                    });
                }
            }
        } catch {
            // package.json issues already reported elsewhere
        }
    }
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

    // Validate services (DL#125)
    if (manifest.services) {
        if (!Array.isArray(manifest.services)) {
            result.errors.push({
                type: 'schema',
                message: 'Field "services" must be an array',
                location: 'plugin.yaml',
            });
        } else {
            manifest.services.forEach((service, index) => {
                if (!service.name) {
                    result.errors.push({
                        type: 'schema',
                        message: `Service at index ${index} is missing "name" field`,
                        location: 'plugin.yaml',
                    });
                }
                if (!service.marker) {
                    result.errors.push({
                        type: 'schema',
                        message: `Service "${service.name || index}" is missing "marker" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify the exported service marker constant name',
                    });
                }
                if (service.doc) {
                    validateDocFile(service.doc, `service "${service.name}"`, context, result);
                }
            });
        }
    }

    // Validate contexts (DL#125)
    if (manifest.contexts) {
        if (!Array.isArray(manifest.contexts)) {
            result.errors.push({
                type: 'schema',
                message: 'Field "contexts" must be an array',
                location: 'plugin.yaml',
            });
        } else {
            manifest.contexts.forEach((ctx, index) => {
                if (!ctx.name) {
                    result.errors.push({
                        type: 'schema',
                        message: `Context at index ${index} is missing "name" field`,
                        location: 'plugin.yaml',
                    });
                }
                if (!ctx.marker) {
                    result.errors.push({
                        type: 'schema',
                        message: `Context "${ctx.name || index}" is missing "marker" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify the exported context marker constant name',
                    });
                }
                if (ctx.doc) {
                    validateDocFile(ctx.doc, `context "${ctx.name}"`, context, result);
                }
            });
        }
    }

    // Validate routes (DL#130)
    if (manifest.routes) {
        if (!Array.isArray(manifest.routes)) {
            result.errors.push({
                type: 'schema',
                message: 'Field "routes" must be an array',
                location: 'plugin.yaml',
            });
        } else {
            manifest.routes.forEach((route, index) => {
                if (!route.path) {
                    result.errors.push({
                        type: 'schema',
                        message: `Route at index ${index} is missing "path" field`,
                        location: 'plugin.yaml',
                    });
                }
                if (!route.jayHtml) {
                    result.errors.push({
                        type: 'schema',
                        message: `Route "${route.path || index}" is missing "jayHtml" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify the export subpath for the jay-html file',
                    });
                }
                if (!route.component) {
                    result.errors.push({
                        type: 'schema',
                        message: `Route "${route.path || index}" is missing "component" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify the exported member name for the page component',
                    });
                }
                // Validate exports exist
                if (route.jayHtml) {
                    validateDocFile(
                        route.jayHtml,
                        `route "${route.path}" jayHtml`,
                        context,
                        result,
                    );
                }
                if (route.css) {
                    validateDocFile(route.css, `route "${route.path}" css`, context, result);
                }
            });
        }
    }
}

/**
 * Resolve a contract file path following the chain:
 * plugin.yaml contract name → package.json exports → actual file.
 *
 * For NPM packages: looks up "./<contractSpec>" in package.json exports,
 * then falls back to searching dist/, lib/, and root.
 * For local plugins: resolves relative to plugin directory.
 */
function resolveContractFile(contractSpec: string, context: PluginContext): string | undefined {
    if (context.isNpmPackage) {
        // 1. Try package.json exports chain first
        const packageJsonPath = path.join(context.pluginPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                if (packageJson.exports) {
                    const exportKey = './' + contractSpec;
                    const exportValue = packageJson.exports[exportKey];
                    if (exportValue) {
                        const resolvedPath =
                            typeof exportValue === 'string'
                                ? exportValue
                                : exportValue.default || exportValue.import || exportValue.require;
                        if (resolvedPath) {
                            const fullPath = path.join(context.pluginPath, resolvedPath);
                            if (fs.existsSync(fullPath)) return fullPath;
                        }
                    }
                }
            } catch {
                // package.json parse error — fall through to guessing
            }
        }

        // 2. Fall back to searching common locations
        for (const dir of ['dist', 'lib', '']) {
            const candidate = path.join(context.pluginPath, dir, contractSpec);
            if (fs.existsSync(candidate)) return candidate;
        }

        return undefined;
    } else {
        // Local plugins: resolve relative to plugin directory
        const candidate = path.join(context.pluginPath, contractSpec);
        return fs.existsSync(candidate) ? candidate : undefined;
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

    const contractPath = resolveContractFile(contract.contract, context);

    if (!contractPath) {
        result.errors.push({
            type: 'file-missing',
            message: `Contract file not found: ${contract.contract}`,
            location: `plugin.yaml contracts[${index}]`,
            suggestion: context.isNpmPackage
                ? `Ensure the contract is exported in package.json and the file exists`
                : `Create the contract file at ${path.join(context.pluginPath, contract.contract)}`,
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
 * Validates that component export name is valid and checks component-contract consistency.
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
        return;
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

    // --- Component-contract consistency check (DL#124 Phase 3) ---
    // Find the component source file and the contract file, then check
    // that .withProps<T>() / .withLoadParams() match contract props/params.
    await checkComponentContractConsistency(contract, context, result);
}

/** Check if a statement has the `export` modifier. */
function hasExportModifier(node: any): boolean {
    return node.modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/**
 * Resolve a module specifier to an actual file path, trying common extensions.
 */
function resolveModulePath(basePath: string): string | undefined {
    for (const ext of ['', '.ts', '.js', '/index.ts', '/index.js']) {
        const candidate = basePath + ext;
        if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
}

/**
 * Resolve the component source file by following the export chain from the
 * plugin's entry module.
 *
 * 1. Find the entry file (from plugin.yaml `module` field or default index.ts)
 * 2. Parse it with TS AST
 * 3. Find the re-export that exports `componentName`
 *    (e.g., `export { productPage } from './components/product-page'`)
 * 4. Resolve that module path to the actual .ts file
 */
function resolveComponentSourcePath(
    componentName: string,
    context: PluginContext,
): string | undefined {
    const modulePath = context.manifest.module || 'index';
    const entryBase = path.join(context.pluginPath, modulePath);
    const entryFile = resolveModulePath(entryBase);

    // Also try lib/ if module is a bare name like "index"
    const libEntryFile = !entryFile
        ? resolveModulePath(path.join(context.pluginPath, 'lib', modulePath))
        : undefined;

    const sourceEntry = entryFile || libEntryFile;
    if (!sourceEntry) return undefined;
    if (!sourceEntry.endsWith('.ts')) return undefined;

    // Parse the entry file and find the re-export for componentName
    let sourceCode: string;
    try {
        sourceCode = fs.readFileSync(sourceEntry, 'utf-8');
    } catch {
        return undefined;
    }

    const sourceFile = ts.createSourceFile(
        sourceEntry,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );

    // Walk statements looking for the component export
    const starReexportModules: string[] = [];

    for (const statement of sourceFile.statements) {
        if (!ts.isExportDeclaration(statement)) continue;
        if (!statement.moduleSpecifier) continue;
        if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

        const moduleSpec = statement.moduleSpecifier.text;
        const exportClause = statement.exportClause;

        if (!exportClause) {
            // `export * from './module'` — collect for later checking
            starReexportModules.push(moduleSpec);
            continue;
        }

        // `export { componentName } from './module'`
        if (ts.isNamedExports(exportClause)) {
            for (const element of exportClause.elements) {
                const exportedName = element.name.text;
                if (exportedName === componentName) {
                    const resolvedBase = path.resolve(path.dirname(sourceEntry), moduleSpec);
                    return resolveModulePath(resolvedBase);
                }
            }
        }
    }

    // Check `export * from ...` modules — the component may be re-exported through one
    for (const moduleSpec of starReexportModules) {
        // Skip external packages (only follow relative imports)
        if (!moduleSpec.startsWith('.')) continue;

        const resolvedBase = path.resolve(path.dirname(sourceEntry), moduleSpec);
        const resolvedPath = resolveModulePath(resolvedBase);
        if (!resolvedPath || !resolvedPath.endsWith('.ts')) continue;

        // Check if this module exports the component name
        try {
            const modSource = fs.readFileSync(resolvedPath, 'utf-8');
            const modFile = ts.createSourceFile(
                resolvedPath,
                modSource,
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.TS,
            );

            for (const stmt of modFile.statements) {
                // export const componentName = ...
                if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
                    for (const decl of stmt.declarationList.declarations) {
                        if (ts.isIdentifier(decl.name) && decl.name.text === componentName) {
                            return resolvedPath;
                        }
                    }
                }
                // export function componentName() ...
                if (
                    ts.isFunctionDeclaration(stmt) &&
                    hasExportModifier(stmt) &&
                    stmt.name?.text === componentName
                ) {
                    return resolvedPath;
                }
            }
        } catch {
            continue;
        }
    }

    // Component might be defined directly in the entry file
    return sourceEntry;
}

/**
 * Resolve the contract file path for a contract entry (reuses resolveContractFile).
 */
function resolveContractPath(contract: any, context: PluginContext): string | undefined {
    return resolveContractFile(contract.contract, context);
}

/**
 * Check component source against contract for props/params consistency (DL#124).
 */
async function checkComponentContractConsistency(
    contract: any,
    context: PluginContext,
    result: ValidationResult,
): Promise<void> {
    // Resolve component source by following the export chain from the entry module
    const componentName = contract.component;
    if (!componentName) return;

    const sourcePath = resolveComponentSourcePath(componentName, context);
    if (!sourcePath) return; // Can't check without source

    // Only check TypeScript sources
    if (!sourcePath.endsWith('.ts')) return;

    // Resolve contract file
    const contractPath = resolveContractPath(contract, context);
    if (!contractPath) return; // Already reported in validateContract

    // Read and parse the contract for props/params
    let contractContent: string;
    try {
        contractContent = await fs.promises.readFile(contractPath, 'utf-8');
    } catch {
        return;
    }

    const parsed = parseContract(contractContent, path.basename(contractPath));
    if (parsed.validations.length > 0) return; // Contract has parse errors, skip

    // Read component source
    let sourceCode: string;
    try {
        sourceCode = await fs.promises.readFile(sourcePath, 'utf-8');
    } catch {
        return;
    }

    // Derive contract name: strip .jay-contract suffix from the contract spec
    const contractName = contract.contract.replace(/\.jay-contract$/, '');

    // Run the check
    const checkResult = checkComponentPropsAndParams(
        sourceCode,
        {
            props: parsed.val?.props,
            params: parsed.val?.params,
        },
        contractName,
        contractPath,
        sourcePath,
    );

    result.errors.push(...checkResult.errors);
    result.warnings.push(...checkResult.warnings);
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
