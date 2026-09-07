import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import {
    loadPluginManifest,
    normalizeActionEntry,
    type PluginManifest,
} from '@jay-framework/compiler-shared';
import { parseContract } from '@jay-framework/compiler-jay-html';
import { ts } from '@jay-framework/typescript-bridge';
import type { ValidatePluginOptions, ValidationResult, PluginContext } from './types';
import { checkComponentPropsAndParams } from './check-component-contract';
import { validateAddMenuCatalog } from './validate-add-menu-catalog';
import { validateAiditorSettings } from './validate-aiditor-settings';

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

    // 7. Add Menu catalog lint (Design Log #30b)
    await validateAddMenuCatalog(context, result);

    // 8. AIditor settings template (materialized via agent-kit — not in core PluginManifest)
    await validateAiditorSettings(context, result);

    // 9. Leak scan (DL#179): serve entry `.` must be compiler-free
    validateNoCompilerLeak(context, result);

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
                } else {
                    validateHandlerRef(
                        contract.component,
                        `Contract "${contract.name}" component`,
                        `plugin.yaml contracts[${index}]`,
                        context,
                        result,
                    );
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
            if (config.component) {
                validateHandlerRef(
                    config.component,
                    `dynamic_contracts[${prefix}] component`,
                    `plugin.yaml dynamic_contracts`,
                    context,
                    result,
                );
            }
            if (config.generator) {
                validateHandlerRef(
                    config.generator,
                    `dynamic_contracts[${prefix}] generator`,
                    `plugin.yaml dynamic_contracts`,
                    context,
                    result,
                );
            }
        }
    }

    // At-least-one-capability rule (DL#179 Part 2). A plugin declaring none of the capability
    // fields does nothing. `global: true` counts iff it has a resolvable init/setup export.
    const hasCapability = Boolean(
        manifest.contracts ||
        manifest.dynamic_contracts ||
        manifest.actions ||
        manifest.validators ||
        manifest.routes ||
        manifest.services ||
        manifest.contexts ||
        manifest.init ||
        manifest.setup ||
        manifest.agentkit ||
        manifest.commands,
    );
    if (!hasCapability) {
        if (manifest.global === true) {
            // A global plugin runs on every page via its init/setup export. Require one to exist.
            const hasGlobalEntry =
                !context.isNpmPackage ||
                checkExportExists('init', context, '.') ||
                checkExportExists('setup', context, '.');
            if (!hasGlobalEntry) {
                result.errors.push({
                    type: 'export-mismatch',
                    message:
                        'Plugin declares "global: true" but exports no init/setup handler to run on each page',
                    location: 'plugin.yaml',
                    suggestion:
                        'Export an "init" (or "setup") handler from the package entry, or declare a capability',
                });
            }
        } else {
            result.warnings.push({
                type: 'schema',
                message:
                    'Plugin declares no capabilities (contracts, dynamic_contracts, actions, validators, routes, services, contexts, init, setup, agentkit, commands)',
                location: 'plugin.yaml',
                suggestion:
                    'Declare at least one capability. See agent-kit/plugin/plugin-structure.md',
            });
        }
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

    // Validate actions (DL#180: devOnly actions load from ./tools, regular actions from `.`)
    if (manifest.actions) {
        for (const entry of manifest.actions) {
            // devOnly must be a boolean when present (mirror the routes[].devOnly check).
            if (
                typeof entry === 'object' &&
                entry.devOnly !== undefined &&
                typeof entry.devOnly !== 'boolean'
            ) {
                result.errors.push({
                    type: 'schema',
                    message: `Action "${entry.name}" devOnly must be a boolean`,
                    location: 'plugin.yaml actions',
                });
            }
            const { name: exportName, devOnly } = normalizeActionEntry(entry);
            if (exportName) {
                validateHandlerRef(
                    exportName,
                    `Action "${exportName}"`,
                    'plugin.yaml actions',
                    context,
                    result,
                    devOnly ? './tools' : '.',
                );
            }
        }
    }

    // Validate init handler
    if (manifest.init) {
        validateHandlerRef(manifest.init, 'Init handler', 'plugin.yaml init', context, result);
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
                } else {
                    // A devOnly route's page component may use the compiler → lives in ./tools (DL#180).
                    validateHandlerRef(
                        route.component,
                        `Route "${route.path}" component`,
                        `plugin.yaml routes`,
                        context,
                        result,
                        route.devOnly ? './tools' : '.',
                    );
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
                if (route.devOnly !== undefined && typeof route.devOnly !== 'boolean') {
                    result.errors.push({
                        type: 'schema',
                        message: `Route "${route.path}" devOnly must be a boolean`,
                        location: 'plugin.yaml',
                    });
                }
            });
        }
    }

    // Validate validators (DL#145)
    if (manifest.validators) {
        if (!Array.isArray(manifest.validators)) {
            result.errors.push({
                type: 'schema',
                message: 'Field "validators" must be an array',
                location: 'plugin.yaml',
            });
        } else {
            manifest.validators.forEach((validator, index) => {
                if (!validator.name) {
                    result.errors.push({
                        type: 'schema',
                        message: `Validator at index ${index} is missing "name" field`,
                        location: 'plugin.yaml',
                    });
                }
                if (!validator.handler) {
                    result.errors.push({
                        type: 'schema',
                        message: `Validator "${validator.name || index}" is missing "handler" field`,
                        location: 'plugin.yaml',
                        suggestion: 'Specify the relative path to the validator handler module',
                    });
                }
                if (validator.handler) {
                    // Validators are a tools capability — handler lives in ./tools (DL#179).
                    validateHandlerRef(
                        validator.handler,
                        `Validator "${validator.name}" handler`,
                        'plugin.yaml validators',
                        context,
                        result,
                        './tools',
                    );
                }
            });
        }
    }

    // Validate setup and agent-kit handler exports
    if (manifest.setup) {
        if (typeof manifest.setup !== 'string') {
            result.errors.push({
                type: 'schema',
                message:
                    'Deprecated nested setup keys (setup.handler / setup.references) — use flat setup: and agentkit: in plugin.yaml',
                location: 'plugin.yaml setup',
                suggestion:
                    'Replace setup.handler with top-level setup: and setup.references with top-level agentkit:',
            });
        } else {
            // Setup is a tools capability — handler lives in ./tools (DL#179).
            validateHandlerRef(
                manifest.setup,
                'Setup handler',
                'plugin.yaml setup',
                context,
                result,
                './tools',
            );
        }
    }
    if (manifest.agentkit) {
        // Agent-kit is a tools capability — handler lives in ./tools (DL#179).
        validateHandlerRef(
            manifest.agentkit,
            'Agent-kit handler',
            'plugin.yaml agentkit',
            context,
            result,
            './tools',
        );
    }
}

/**
 * Which package.json export a capability's handler is loaded from (DL#179 runtime/tools split).
 * `.` = serve entry (compiler-free), `./tools` = tools entry (compiler OK), `./client` = client bundle.
 */
type EntryKey = '.' | './tools' | './client';

/**
 * Check if a named export exists in the given plugin entry file.
 * Reads the built .js (or falls back to package `main`) for `exportKey` and searches for the export.
 * Returns true (permissive) when the entry can't be resolved — the missing-export error would be
 * misleading if we can't even find the file to scan.
 */
function checkExportExists(
    exportName: string,
    context: PluginContext,
    exportKey: EntryKey = '.',
): boolean {
    const packageJsonPath = path.join(context.pluginPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return true;

    let mainPath: string | undefined;
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.exports?.[exportKey]) {
            const entry = packageJson.exports[exportKey];
            const entryPath = typeof entry === 'string' ? entry : entry.default || entry.import;
            if (entryPath) mainPath = path.join(context.pluginPath, entryPath);
        }
        // Only the `.` entry has a legacy `main` fallback.
        if (!mainPath && exportKey === '.' && packageJson.main) {
            mainPath = path.join(context.pluginPath, packageJson.main);
        }
    } catch {
        return true;
    }

    if (!mainPath || !fs.existsSync(mainPath)) return true;

    try {
        const content = fs.readFileSync(mainPath, 'utf-8');
        const patterns = [
            new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`, 'm'),
            new RegExp(`export\\s+(?:async\\s+)?function\\s+${exportName}\\b`),
            new RegExp(`export\\s+(?:const|let|var)\\s+${exportName}\\b`),
        ];
        return patterns.some((p) => p.test(content));
    } catch {
        return true;
    }
}

function isRelativePath(value: string): boolean {
    return value.startsWith('./') || value.startsWith('../');
}

/**
 * Resolve the built file for a package.json export key (used by the static scans below).
 */
function resolveEntryFile(context: PluginContext, exportKey: EntryKey): string | undefined {
    const packageJsonPath = path.join(context.pluginPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return undefined;
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const entry = packageJson.exports?.[exportKey];
        const entryPath =
            typeof entry === 'string' ? entry : entry?.default || entry?.import || undefined;
        const resolved =
            entryPath || (exportKey === '.' ? packageJson.main : undefined)
                ? path.join(context.pluginPath, entryPath || packageJson.main)
                : undefined;
        return resolved && fs.existsSync(resolved) ? resolved : undefined;
    } catch {
        return undefined;
    }
}

/** True when the plugin declares a capability that can provide a (possibly interactive) component. */
function hasComponentCapability(context: PluginContext): boolean {
    const m = context.manifest;
    return Boolean(m.contracts || m.dynamic_contracts || m.routes);
}

/**
 * A plugin needs a `./tools` export iff it declares a tools capability: validators, commands,
 * agentkit, setup (DL#179) or any devOnly action (DL#180).
 */
function needsToolsEntry(manifest: PluginManifest): boolean {
    if (manifest.validators || manifest.commands || manifest.agentkit || manifest.setup) {
        return true;
    }
    if (manifest.actions) {
        return manifest.actions.some((entry) => normalizeActionEntry(entry).devOnly === true);
    }
    return false;
}

/**
 * Detect whether any provided component has an interactive phase (DL#179 Part 2 rule 3).
 *
 * Purely static: scan the built, un-minified server `.` bundle for the interactive mark
 * `withInteractiveMark(`. Jay's runtime-mode code-deletion transform rewrites `withInteractive` →
 * `withInteractiveMark` for the server build, so the mark is present iff a component declared an
 * interactive phase. Returns 'unknown' when the bundle can't be read (degrade to a warning).
 */
function detectInteractivePhase(context: PluginContext): boolean | 'unknown' {
    // Local plugins aren't built to a `.` bundle we can scan.
    if (!context.isNpmPackage) return 'unknown';
    const entryFile = resolveEntryFile(context, '.');
    if (!entryFile) return 'unknown';
    try {
        const content = fs.readFileSync(entryFile, 'utf-8');
        return content.includes('withInteractiveMark(');
    } catch {
        return 'unknown';
    }
}

/**
 * Leak scan (DL#179): the serve entry `.` (`dist/index.js`) must contain no `@jay-framework/compiler-`
 * import. Because the plugin build externalizes the compiler namespace, any tools handler that leaks
 * into `.` surfaces as a literal `import '@jay-framework/compiler-…'` string — a cheap text scan.
 */
function validateNoCompilerLeak(context: PluginContext, result: ValidationResult): void {
    if (!context.isNpmPackage) return;
    const entryFile = resolveEntryFile(context, '.');
    if (!entryFile) return; // not built / no `.` entry — nothing to scan
    let content: string;
    try {
        content = fs.readFileSync(entryFile, 'utf-8');
    } catch {
        return;
    }
    if (content.includes('@jay-framework/compiler-')) {
        result.errors.push({
            type: 'compiler-leak',
            message:
                'Serve entry "." (dist/index.js) imports "@jay-framework/compiler-…" — the compiler ' +
                'must not reach the production serve bundle',
            location: entryFile,
            suggestion:
                'Move the compiler-using handler (validator, agentkit, setup, or a devOnly action) ' +
                'to lib/tools.ts (the "./tools" export) and remove its re-export from lib/index.ts. ' +
                'A compiler-using action is really a command or a devOnly action (DL#179/#180).',
        });
    }
}

/**
 * Validate that a handler/export reference is correct for the plugin type.
 * For NPM plugins: must be an export name (not a relative path), and must exist in the entry
 * indicated by `exportKey` (DL#179: tools handlers load from `./tools`, serve handlers from `.`).
 * For local plugins: if it's a path, the file must exist.
 */
function validateHandlerRef(
    value: string,
    label: string,
    location: string,
    context: PluginContext,
    result: ValidationResult,
    exportKey: EntryKey = '.',
): void {
    if (context.isNpmPackage) {
        if (isRelativePath(value)) {
            result.errors.push({
                type: 'export-mismatch',
                message: `${label} "${value}" is a relative path, but NPM plugins must use an export name`,
                location,
                suggestion: `Export the function from the package entry point and use the export name instead of a path`,
            });
        } else if (!checkExportExists(value, context, exportKey)) {
            const entryFile =
                exportKey === './tools'
                    ? 'lib/tools.ts'
                    : exportKey === './client'
                      ? 'lib/index.client.ts'
                      : 'lib/index.ts';
            result.errors.push({
                type: 'export-mismatch',
                message: `${label} "${value}" is not exported from the "${exportKey}" entry`,
                location,
                suggestion: `Add "export { ${value} } from '...'" to ${entryFile} (the "${exportKey}" export)`,
            });
        }
    } else if (isRelativePath(value)) {
        const handlerPath = path.join(context.pluginPath, value);
        const extensions = ['', '.ts', '.js', '/index.ts', '/index.js'];
        const found = extensions.some((ext) => fs.existsSync(handlerPath + ext));
        if (!found) {
            result.errors.push({
                type: 'file-missing',
                message: `${label} not found: ${value}`,
                location,
                suggestion: `Create the handler at ${handlerPath}.ts`,
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

            // Client entry point (DL#179 Part 2 rule 3): required only when a provided component
            // has an interactive phase, or the plugin declares contexts. Server-only (slow/fast)
            // component plugins and tools-only plugins need no ./client.
            if (!packageJson.exports['./client']) {
                const interactivity = detectInteractivePhase(context);
                const needsClient =
                    context.manifest.contexts !== undefined || interactivity === true;
                if (needsClient) {
                    result.errors.push({
                        type: 'export-mismatch',
                        message:
                            'package.json exports missing "./client" entry point, but the plugin ' +
                            (context.manifest.contexts !== undefined
                                ? 'declares contexts (client-side by definition)'
                                : 'provides an interactive component'),
                        location: packageJsonPath,
                        suggestion:
                            'Add "./client": "./dist/index.client.js" to exports. ' +
                            'The client bundle provides components for hydration and client-side contexts. ' +
                            'Build with: vite build (client) + vite build --ssr (server)',
                    });
                } else if (interactivity === 'unknown' && hasComponentCapability(context)) {
                    // Degrade to a warning when interactivity can't be determined (DL#179: don't error).
                    result.warnings.push({
                        type: 'export-mismatch',
                        message:
                            'package.json exports missing "./client" entry point; could not determine ' +
                            'whether any component is interactive (build the plugin before validating)',
                        location: packageJsonPath,
                        suggestion:
                            'If any component declares an interactive phase, add "./client": "./dist/index.client.js"',
                    });
                }
            }

            // Tools entry point (DL#179 Part 2 rule 2 + DL#180): required iff the plugin declares any
            // tools capability (validators / commands / agentkit / setup) or a devOnly action. These
            // handlers load only from ./tools, so a missing export means they can't be loaded.
            if (!packageJson.exports['./tools'] && needsToolsEntry(context.manifest)) {
                result.errors.push({
                    type: 'export-mismatch',
                    message:
                        'package.json exports missing "./tools" entry point, but the plugin declares ' +
                        'tools capabilities (validators, commands, agentkit, setup, or devOnly actions)',
                    location: packageJsonPath,
                    suggestion:
                        'Add "./tools": "./dist/tools.js" to exports and re-export those handlers from lib/tools.ts',
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

        // Check that agent-kit directory is included in files if it exists
        const agentKitDir = path.join(context.pluginPath, 'agent-kit');
        if (fs.existsSync(agentKitDir) && fs.statSync(agentKitDir).isDirectory()) {
            const filesArray: string[] | undefined = packageJson.files;
            if (!filesArray || !filesArray.includes('agent-kit')) {
                result.warnings.push({
                    type: 'export-mismatch',
                    message: 'agent-kit directory exists but is not listed in package.json "files"',
                    location: packageJsonPath,
                    suggestion:
                        'Add "agent-kit" to the "files" array so agent-kit files are shipped with the package',
                });
            }
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
 * Check if a generator export is a bare function declaration instead of a
 * DynamicContractGenerator object (created via makeContractGenerator()).
 *
 * Follows the export chain from the entry module to find where the symbol
 * is declared, then checks if it's a function/function* declaration (wrong)
 * vs a const/variable (correct).
 */
function isBareFunctionExport(exportName: string, context: PluginContext): boolean {
    const sourcePath = resolveExportSourceFile(exportName, context);
    if (!sourcePath) return false;

    let sourceCode: string;
    try {
        sourceCode = fs.readFileSync(sourcePath, 'utf-8');
    } catch {
        return false;
    }

    const sourceFile = ts.createSourceFile(
        sourcePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );

    for (const statement of sourceFile.statements) {
        if (
            ts.isFunctionDeclaration(statement) &&
            hasExportModifier(statement) &&
            statement.name?.text === exportName
        ) {
            return true;
        }
    }

    return false;
}

/**
 * Resolve a .js import specifier to a .ts source file (ESM convention).
 */
function resolveModulePathWithJsToTs(basePath: string): string | undefined {
    const result = resolveModulePath(basePath);
    if (result) return result;
    if (basePath.endsWith('.js')) {
        return resolveModulePath(basePath.slice(0, -3) + '.ts');
    }
    return undefined;
}

/**
 * Follow the export chain from the entry module to find the source file
 * where `exportName` is declared. Handles re-exports and `export * from`.
 */
function resolveExportSourceFile(exportName: string, context: PluginContext): string | undefined {
    const modulePath = context.manifest.module || 'index';
    const entryBase = path.join(context.pluginPath, modulePath);
    const libEntryBase = path.join(context.pluginPath, 'lib', modulePath);
    const sourceEntry = resolveModulePath(entryBase) || resolveModulePath(libEntryBase);
    if (!sourceEntry || !sourceEntry.endsWith('.ts')) return undefined;

    return followExportChain(exportName, sourceEntry);
}

function followExportChain(exportName: string, filePath: string): string | undefined {
    let sourceCode: string;
    try {
        sourceCode = fs.readFileSync(filePath, 'utf-8');
    } catch {
        return undefined;
    }

    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );

    const starReexportModules: string[] = [];

    for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
            if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
            const moduleSpec = statement.moduleSpecifier.text;

            if (!statement.exportClause) {
                starReexportModules.push(moduleSpec);
                continue;
            }

            if (ts.isNamedExports(statement.exportClause)) {
                for (const element of statement.exportClause.elements) {
                    if (element.name.text === exportName) {
                        const resolvedBase = path.resolve(path.dirname(filePath), moduleSpec);
                        return resolveModulePathWithJsToTs(resolvedBase);
                    }
                }
            }
        }

        // Direct export: export function/const in this file
        if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement)) {
            if (statement.name?.text === exportName) return filePath;
        }
        if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
            for (const decl of statement.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === exportName) return filePath;
            }
        }
    }

    // Check star re-exports
    for (const moduleSpec of starReexportModules) {
        if (!moduleSpec.startsWith('.')) continue;
        const resolvedBase = path.resolve(path.dirname(filePath), moduleSpec);
        const resolved = resolveModulePathWithJsToTs(resolvedBase);
        if (!resolved) continue;
        const found = followExportChain(exportName, resolved);
        if (found) return found;
    }

    return undefined;
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
            } else if (isBareFunctionExport(config.generator, context)) {
                result.errors.push({
                    type: 'export-mismatch',
                    message: `Generator "${config.generator}" for ${prefix} is a bare function — it must be a DynamicContractGenerator object`,
                    location: 'plugin.yaml dynamic_contracts',
                    suggestion: `Use makeContractGenerator().generateWith(...) from @jay-framework/fullstack-component instead of exporting a plain function`,
                });
            }
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
