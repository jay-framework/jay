import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { WithValidations } from './with-validations';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const LOCAL_PLUGIN_PATH = 'src/plugins';

/**
 * Plugin initialization configuration.
 *
 * For the `makeJayInit` pattern:
 * - undefined: Auto-discover `lib/init.ts` (for uncompiled/local plugins)
 * - string: Export name for the JayInit constant (for compiled/NPM packages)
 *
 * @example
 * ```yaml
 * # For compiled NPM packages - specify the export name
 * name: my-plugin
 * init: myPluginInit
 * ```
 */
export type PluginInitConfig = string;

/**
 * Dynamic contract generator configuration.
 */
export interface DynamicContractConfig {
    /** Path to the generator module (relative to plugin root) */
    generator: string;
    /** Path to the headless component (relative to plugin root) */
    component: string;
    /** Prefix for generated contract names (e.g., "cms" -> "cms/blog-posts") */
    prefix: string;
}

/**
 * Plugin manifest structure from plugin.yaml
 */
export interface PluginManifest {
    name: string;
    version?: string;
    module?: string; // Optional: For local plugins, relative path to module (e.g., "dist/index.js"). For NPM packages, omit to use main export.
    /** When true, this plugin is loaded on every page regardless of usage in jay-html.
     *  Useful for global tools like WebMCP, analytics, or dev tools. */
    global?: boolean;
    contracts?: Array<{
        name: string;
        contract: string; // For NPM: export subpath (e.g., "contract.jay-contract"). For local: relative path.
        component: string; // Exported member name from module (e.g., "moodTracker")
        description?: string;
    }>;
    dynamic_contracts?: DynamicContractConfig | DynamicContractConfig[];
    /** Named exports from plugin backend bundle that are JayAction instances.
     *  Can be a string (export name, no metadata) or an object with a .jay-action file reference.
     *  Actions with .jay-action metadata are exposed to AI agents; those without are not. */
    actions?: ActionManifestEntry[];
    /** Plugin initialization configuration */
    init?: PluginInitConfig;
    /** Plugin setup configuration (Design Log #87) */
    setup?: {
        /** Export name (NPM) or relative path (local) to setup handler function */
        handler: string;
        /** Export name for reference data generation (called by jay-stack agent-kit) */
        references?: string;
        /** Human-readable description of what setup does */
        description?: string;
    };
}

/**
 * Action entry in plugin.yaml.
 * - `string`: export name only, no metadata (not exposed to AI agents)
 * - `{ name, action }`: export name + path to .jay-action metadata file
 */
export type ActionManifestEntry = string | { name: string; action: string };

/**
 * Normalizes an action manifest entry to { name, action? }.
 * Strings become { name: string, action: undefined }.
 */
export function normalizeActionEntry(entry: ActionManifestEntry): {
    name: string;
    action?: string;
} {
    if (typeof entry === 'string') {
        return { name: entry };
    }
    return { name: entry.name, action: entry.action };
}

/**
 * Result of resolving a plugin component
 */
export interface PluginComponentResolution {
    /** Absolute path to the contract file */
    contractPath: string;
    /** Absolute path to the component file (without extension) - used for local plugins */
    componentPath: string;
    /** Component name to import */
    componentName: string;
    /** Whether this is an NPM package (vs local plugin) */
    isNpmPackage: boolean;
    /** For NPM packages: the package name to import from */
    packageName?: string;
}

/**
 * Loads and parses a plugin.yaml file
 *
 * @param pluginDir - Absolute path to plugin directory
 * @returns Parsed plugin manifest or null if not found/invalid
 */
export function loadPluginManifest(pluginDir: string): PluginManifest | null {
    const pluginYamlPath = path.join(pluginDir, 'plugin.yaml');

    if (!fs.existsSync(pluginYamlPath)) {
        return null;
    }

    try {
        const yamlContent = fs.readFileSync(pluginYamlPath, 'utf-8');
        return YAML.parse(yamlContent);
    } catch (error) {
        return null;
    }
}

/**
 * Finds a dynamic contract config that matches the given contract name.
 * Dynamic contracts use a prefix format: "prefix/name" (e.g., "list/recipes-list")
 *
 * @param manifest - The plugin manifest
 * @param contractName - The contract name to match (e.g., "list/recipes-list")
 * @returns The matching DynamicContractConfig or null if not found
 */
export function findDynamicContract(
    manifest: PluginManifest,
    contractName: string,
): DynamicContractConfig | null {
    if (!manifest.dynamic_contracts) {
        return null;
    }

    // Extract prefix from contract name (e.g., "list" from "list/recipes-list")
    const slashIndex = contractName.indexOf('/');
    if (slashIndex === -1) {
        return null; // Not a dynamic contract format
    }

    const prefix = contractName.substring(0, slashIndex);

    // Normalize to array
    const dynamicConfigs = Array.isArray(manifest.dynamic_contracts)
        ? manifest.dynamic_contracts
        : [manifest.dynamic_contracts];

    // Find matching config by prefix
    return dynamicConfigs.find((config) => config.prefix === prefix) || null;
}

/**
 * Resolves a plugin manifest from a local plugin directory (src/plugins/)
 *
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the plugin
 * @returns Resolution result with validation messages, or null if not found locally
 */
function resolveLocalPluginManifest(
    projectRoot: string,
    pluginName: string,
): WithValidations<PluginManifest> | null {
    const localPluginPath = path.join(projectRoot, LOCAL_PLUGIN_PATH, pluginName);
    const pluginYamlPath = path.join(localPluginPath, 'plugin.yaml');

    if (!fs.existsSync(localPluginPath)) {
        return null; // Not found locally, will try NPM
    }

    if (!fs.existsSync(pluginYamlPath)) {
        return new WithValidations(null as any, [
            `Local plugin "${pluginName}" found at ${localPluginPath} but plugin.yaml is missing`,
        ]);
    }

    const manifest = loadPluginManifest(localPluginPath);

    if (!manifest) {
        return new WithValidations(null as any, [
            `Failed to parse plugin.yaml for local plugin "${pluginName}" at ${pluginYamlPath}`,
        ]);
    }

    if (!manifest.contracts && !manifest.dynamic_contracts) {
        return new WithValidations(null as any, [
            `Local plugin "${pluginName}" has no contracts or dynamic_contracts defined in plugin.yaml`,
        ]);
    }

    return new WithValidations(manifest, []);
}

/**
 * Resolves a plugin component from a local plugin directory (src/plugins/)
 *
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the plugin
 * @param contractName - Name of the contract to resolve
 * @returns Resolution result with validation messages
 */
function resolveLocalPlugin(
    projectRoot: string,
    pluginName: string,
    contractName: string,
): WithValidations<PluginComponentResolution> | null {
    const manifestWithValidations = resolveLocalPluginManifest(projectRoot, pluginName);
    if (!manifestWithValidations) {
        return null;
    }

    if (!manifestWithValidations.val || manifestWithValidations.validations.length > 0)
        return new WithValidations(null, manifestWithValidations.validations);

    const manifest = manifestWithValidations.val;

    // Component path comes from manifest.module (or defaults to index.js)
    const componentModule = manifest.module || 'index.js';
    const localPluginPath = path.join(projectRoot, LOCAL_PLUGIN_PATH, pluginName);
    const componentPath = path.join(localPluginPath, componentModule);

    // Try to find as static contract first
    if (manifest.contracts && manifest.contracts.length > 0) {
        const contract = manifest.contracts.find((c) => c.name === contractName);
        if (contract) {
            return new WithValidations(
                {
                    contractPath: path.join(localPluginPath, contract.contract),
                    componentPath: componentPath,
                    componentName: contract.component,
                    isNpmPackage: false,
                },
                [],
            );
        }
    }

    // Try to find as dynamic contract (prefix/name format)
    const dynamicConfig = findDynamicContract(manifest, contractName);
    if (dynamicConfig) {
        // For dynamic contracts, contractPath is not known at compile time
        // We use a placeholder path that will be resolved at materialization time
        return new WithValidations(
            {
                contractPath: '', // Dynamic contracts don't have a static path
                componentPath: componentPath,
                componentName: dynamicConfig.component,
                isNpmPackage: false,
            },
            [],
        );
    }

    // No matching contract found
    const availableContracts = manifest.contracts?.map((c) => c.name) || [];
    const dynamicPrefixes = manifest.dynamic_contracts
        ? (Array.isArray(manifest.dynamic_contracts)
              ? manifest.dynamic_contracts
              : [manifest.dynamic_contracts]
          ).map((c) => `${c.prefix}/*`)
        : [];
    const allAvailable = [...availableContracts, ...dynamicPrefixes].join(', ');

    return new WithValidations(null as any, [
        `Contract "${contractName}" not found in local plugin "${pluginName}". Available: ${allAvailable}`,
    ]);
}

/**
 * Resolves a plugin manifest from an NPM package (node_modules/)
 *
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the NPM package
 * @returns Resolution result with validation messages, or null if not found
 */
function resolveNpmPluginManifest(
    projectRoot: string,
    pluginName: string,
): WithValidations<PluginManifest> | null {
    // Use Node's require.resolve to find plugin.yaml directly
    let pluginYamlPath: string;
    try {
        // Resolve plugin.yaml directly - package must export it
        pluginYamlPath = require.resolve(`${pluginName}/plugin.yaml`, {
            paths: [projectRoot],
        });
    } catch (error) {
        return new WithValidations(null as any, [
            `NPM package "${pluginName}" not found or plugin.yaml is not exported. Is this a Jay Stack plugin?`,
        ]);
    }

    const npmPluginPath = path.dirname(pluginYamlPath);

    if (!fs.existsSync(pluginYamlPath)) {
        return new WithValidations(null as any, [
            `NPM package "${pluginName}" found but plugin.yaml is missing. Is this a Jay Stack plugin?`,
        ]);
    }

    const manifest = loadPluginManifest(npmPluginPath);

    if (!manifest) {
        return new WithValidations(null as any, [
            `Failed to parse plugin.yaml for NPM package "${pluginName}" at ${pluginYamlPath}`,
        ]);
    }

    if (!manifest.contracts && !manifest.dynamic_contracts) {
        return new WithValidations(null as any, [
            `NPM package "${pluginName}" has no contracts or dynamic_contracts defined in plugin.yaml`,
        ]);
    }

    return new WithValidations(manifest, []);
}

/**
 * Resolves a plugin component from an NPM package (node_modules/)
 *
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the NPM package
 * @param contractName - Name of the contract to resolve
 * @returns Resolution result with validation messages
 */
function resolveNpmPlugin(
    projectRoot: string,
    pluginName: string,
    contractName: string,
): WithValidations<PluginComponentResolution> | null {
    const manifestWithValidations = resolveNpmPluginManifest(projectRoot, pluginName);
    if (!manifestWithValidations) {
        return null;
    }

    if (!manifestWithValidations.val || manifestWithValidations.validations.length > 0)
        return new WithValidations(null, manifestWithValidations.validations);

    const manifest = manifestWithValidations.val;

    // For NPM packages, resolve through package.json exports
    const pluginYamlPath: string = require.resolve(`${pluginName}/plugin.yaml`, {
        paths: [projectRoot],
    });
    const npmPluginPath = path.dirname(pluginYamlPath);
    const packageJsonPath = path.join(npmPluginPath, 'package.json');

    // Helper to get component path from package.json
    const getComponentPath = (): string => {
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                const packageName = packageJson.name;
                const moduleName = manifest.module || packageName;

                if (
                    (moduleName === packageName || !manifest.module) &&
                    packageJson.exports &&
                    packageJson.exports['.']
                ) {
                    const mainExport = packageJson.exports['.'];
                    const mainPath =
                        typeof mainExport === 'string'
                            ? mainExport
                            : mainExport.default || mainExport.import;
                    return path.join(npmPluginPath, mainPath);
                }
            } catch {
                // Fallback below
            }
        }
        return path.join(npmPluginPath, 'dist/index.js');
    };

    // Try to find as static contract first
    if (manifest.contracts && manifest.contracts.length > 0) {
        const contract = manifest.contracts.find((c) => c.name === contractName);
        if (contract) {
            const componentPath = getComponentPath();
            let contractPath: string;

            if (fs.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                    const contractSpec = contract.contract;
                    const contractExportKey = './' + contractSpec;

                    if (packageJson.exports && packageJson.exports[contractExportKey]) {
                        const exportPath = packageJson.exports[contractExportKey];
                        contractPath = path.join(npmPluginPath, exportPath);
                    } else {
                        const possiblePaths = [
                            path.join(npmPluginPath, 'dist', contractSpec),
                            path.join(npmPluginPath, 'lib', contractSpec),
                            path.join(npmPluginPath, contractSpec),
                        ];
                        contractPath =
                            possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];
                    }
                } catch {
                    contractPath = path.join(npmPluginPath, 'dist', contract.contract);
                }
            } else {
                contractPath = path.join(npmPluginPath, 'dist', contract.contract);
            }

            return new WithValidations(
                {
                    contractPath: contractPath,
                    componentPath: componentPath,
                    componentName: contract.component,
                    isNpmPackage: true,
                    packageName: pluginName,
                },
                [],
            );
        }
    }

    // Try to find as dynamic contract (prefix/name format)
    const dynamicConfig = findDynamicContract(manifest, contractName);
    if (dynamicConfig) {
        const componentPath = getComponentPath();

        return new WithValidations(
            {
                contractPath: '', // Dynamic contracts don't have a static path
                componentPath: componentPath,
                componentName: dynamicConfig.component,
                isNpmPackage: true,
                packageName: pluginName,
            },
            [],
        );
    }

    // No matching contract found
    const availableContracts = manifest.contracts?.map((c) => c.name) || [];
    const dynamicPrefixes = manifest.dynamic_contracts
        ? (Array.isArray(manifest.dynamic_contracts)
              ? manifest.dynamic_contracts
              : [manifest.dynamic_contracts]
          ).map((c) => `${c.prefix}/*`)
        : [];
    const allAvailable = [...availableContracts, ...dynamicPrefixes].join(', ');

    return new WithValidations(null as any, [
        `Contract "${contractName}" not found in NPM package "${pluginName}". Available: ${allAvailable}`,
    ]);
}

/**
 * Resolves a plugin component, trying local plugins first, then NPM packages
 *
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the plugin
 * @param contractName - Name of the contract to resolve
 * @returns Resolution result with validation messages
 */
export function resolvePluginComponent(
    projectRoot: string,
    pluginName: string,
    contractName: string,
): WithValidations<PluginComponentResolution> {
    // Try local plugins first
    const localResult = resolveLocalPlugin(projectRoot, pluginName, contractName);
    if (localResult && localResult.val !== null && localResult.validations.length === 0) {
        return localResult; // Found locally successfully
    }

    // Try NPM packages
    const npmResult = resolveNpmPlugin(projectRoot, pluginName, contractName);
    if (npmResult && npmResult.val !== null && npmResult.validations.length === 0) {
        return npmResult; // Found in NPM successfully
    }

    // If local plugin exists but has errors, return those (prefer local over NPM)
    // localResult is non-null when the directory exists but has issues
    if (localResult && localResult.validations.length > 0) {
        return localResult;
    }

    // If NPM plugin exists but has errors, return those
    // However, only if local didn't exist at all (localResult is null)
    if (npmResult && npmResult.validations.length > 0 && localResult === null) {
        const npmError = npmResult.validations[0];
        const isGenericPackageNotFound =
            (npmError.startsWith('NPM package') && npmError.includes('not found')) ||
            (npmError.startsWith('Plugin') && npmError.includes('not found'));
        if (!isGenericPackageNotFound) {
            return npmResult;
        }
    }

    // Not found anywhere
    return new WithValidations(null as any, [
        `Plugin "${pluginName}" not found. ` +
            `Searched in src/plugins/${pluginName}/ and node_modules/${pluginName}/. ` +
            `Ensure the plugin is installed or exists in your project.`,
    ]);
}

/**
 * Resolves a plugin manifest from a local plugin or NPM package
 *
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the plugin
 * @returns Resolution result with validation messages
 */
export function resolvePluginManifest(
    projectRoot: string,
    pluginName: string,
): WithValidations<PluginManifest> {
    const localResult = resolveLocalPluginManifest(projectRoot, pluginName);
    if (localResult && localResult.val !== null && localResult.validations.length === 0) {
        return localResult;
    }
    const npmResult = resolveNpmPluginManifest(projectRoot, pluginName);
    if (npmResult && npmResult.val !== null && npmResult.validations.length === 0) {
        return npmResult;
    }

    // If local plugin exists but has errors, return those (prefer local over NPM)
    if (localResult && localResult.validations.length > 0) {
        return localResult;
    }

    // If NPM plugin exists but has errors, return those
    if (npmResult && npmResult.validations.length > 0 && localResult === null) {
        const npmError = npmResult.validations[0];
        const isGenericPackageNotFound =
            (npmError.startsWith('NPM package') && npmError.includes('not found')) ||
            (npmError.startsWith('Plugin') && npmError.includes('not found'));
        if (!isGenericPackageNotFound) {
            return npmResult;
        }
    }

    // Neither found - return a "not found" error
    return new WithValidations(null as any, [
        `Plugin "${pluginName}" not found. ` +
            `Searched in src/plugins/${pluginName}/ and node_modules/${pluginName}/. ` +
            `Ensure the plugin is installed or exists in your project.`,
    ]);
}
