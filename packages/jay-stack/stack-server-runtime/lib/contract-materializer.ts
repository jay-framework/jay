/**
 * Contract Materializer
 *
 * Materializes dynamic contracts to disk for agent discovery.
 * Also creates an index file listing both static and dynamic contracts.
 *
 * @see Design Log #80 - Materializing Dynamic Contracts for Agentic Page Generation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import type {
    DynamicContractGenerator,
    GeneratedContractYaml,
} from '@jay-framework/fullstack-component';
import { type DynamicContractConfig, normalizeActionEntry } from '@jay-framework/compiler-shared';
import { createRequire } from 'module';
import { type ScannedPlugin, scanPlugins } from './plugin-scanner';
import type { ViteSSRLoader } from './action-discovery';
import { getLogger } from '@jay-framework/logger';
import { loadActionMetadata, resolveActionMetadataPath } from './action-metadata';

const require = createRequire(import.meta.url);

// ============================================================================
// Types
// ============================================================================

/** Action metadata entry in plugins-index.yaml */
export interface ActionIndexEntry {
    name: string;
    description: string;
    /** Path to the .jay-action file (relative to project root) */
    path: string;
}

/** Contract entry within a plugin in plugins-index.yaml */
export interface PluginContractEntry {
    name: string;
    type: 'static' | 'dynamic';
    path: string;
    metadata?: Record<string, unknown>;
}

/** Entry for plugins-index.yaml (Design Log #85) */
export interface PluginsIndexEntry {
    name: string;
    path: string;
    contracts: PluginContractEntry[];
    /** Actions with .jay-action metadata (exposed to AI agents) */
    actions?: ActionIndexEntry[];
}

export interface PluginsIndex {
    plugins: PluginsIndexEntry[];
}

export interface MaterializeContractsOptions {
    projectRoot: string;
    outputDir?: string; // defaults to agent-kit/materialized-contracts
    force?: boolean;
    dynamicOnly?: boolean;
    pluginFilter?: string;
    verbose?: boolean;
    /** Optional Vite server for TypeScript support */
    viteServer?: ViteSSRLoader;
}

export interface MaterializeResult {
    pluginsIndex: PluginsIndex;
    staticCount: number;
    dynamicCount: number;
    outputDir: string;
}

// Note: PluginInfo is now ScannedPlugin from ./plugin-scanner

// ============================================================================
// Dynamic Contract Execution
// ============================================================================

/**
 * Executes a single dynamic contract generator with injected services
 */
async function executeDynamicGenerator(
    plugin: ScannedPlugin,
    config: DynamicContractConfig,
    projectRoot: string,
    services: Map<symbol, unknown>,
    verbose: boolean,
    viteServer?: ViteSSRLoader,
): Promise<GeneratedContractYaml[]> {
    const { pluginPath, name: pluginName, isLocal, packageName } = plugin;

    // Validate generator is specified
    if (!config.generator) {
        throw new Error(
            `Plugin "${pluginName}" has dynamic_contracts entry but no generator specified`,
        );
    }

    // Determine if generator is a file path or an export name
    // File paths start with './' or '/' or contain file extension
    const isFilePath =
        config.generator.startsWith('./') ||
        config.generator.startsWith('/') ||
        config.generator.includes('.ts') ||
        config.generator.includes('.js');

    let generator: DynamicContractGenerator;

    if (isFilePath) {
        // Generator is a file path - resolve and import the file
        let generatorPath: string;
        if (!isLocal) {
            try {
                generatorPath = require.resolve(`${packageName}/${config.generator}`, {
                    paths: [projectRoot],
                });
            } catch {
                generatorPath = path.join(pluginPath, config.generator);
            }
        } else {
            generatorPath = path.join(pluginPath, config.generator);
        }

        // Add extension if needed
        if (!fs.existsSync(generatorPath)) {
            const withTs = generatorPath + '.ts';
            const withJs = generatorPath + '.js';
            if (fs.existsSync(withTs)) {
                generatorPath = withTs;
            } else if (fs.existsSync(withJs)) {
                generatorPath = withJs;
            }
        }

        if (!fs.existsSync(generatorPath)) {
            throw new Error(
                `Generator file not found for plugin "${pluginName}": ${config.generator}`,
            );
        }

        if (verbose) {
            getLogger().info(`   Loading generator from file: ${generatorPath}`);
        }

        let generatorModule: Record<string, any>;
        if (viteServer) {
            generatorModule = await viteServer.ssrLoadModule(generatorPath);
        } else {
            generatorModule = await import(generatorPath);
        }

        generator = generatorModule.generator || generatorModule.default;
    } else {
        // Generator is an export name - import from package's main bundle
        if (verbose) {
            getLogger().info(
                `   Loading generator export: ${config.generator} from ${packageName}`,
            );
        }

        let pluginModule: Record<string, any>;
        if (viteServer) {
            pluginModule = await viteServer.ssrLoadModule(packageName);
        } else {
            pluginModule = await import(packageName);
        }

        generator = pluginModule[config.generator];

        if (!generator) {
            throw new Error(
                `Generator "${config.generator}" not exported from plugin "${pluginName}". ` +
                    `Ensure it's exported from the package's index.ts`,
            );
        }
    }

    if (!generator || typeof generator.generate !== 'function') {
        throw new Error(
            `Generator "${config.generator}" for plugin "${pluginName}" must have a 'generate' function. ` +
                `Use makeContractGenerator() to create valid generators.`,
        );
    }

    // Resolve required services
    const resolvedServices: unknown[] = [];
    for (const marker of generator.services) {
        const service = services.get(marker as symbol);
        if (!service) {
            const markerName = (marker as symbol).description ?? 'unknown';
            throw new Error(
                `Service "${markerName}" required by ${pluginName} generator not found. ` +
                    `Ensure it's registered in init.ts`,
            );
        }
        resolvedServices.push(service);
    }

    // Execute generator
    if (verbose) {
        getLogger().info(`   Executing generator...`);
    }

    return await generator.generate(...resolvedServices);
}

// ============================================================================
// Contract Resolution
// ============================================================================

/**
 * Resolves the path to a static contract file
 */
function resolveStaticContractPath(
    plugin: ScannedPlugin,
    contractSpec: string,
    projectRoot: string,
): string {
    const { pluginPath, isLocal, packageName } = plugin;

    if (!isLocal) {
        // For npm packages, try to resolve through package.json exports
        try {
            return require.resolve(`${packageName}/${contractSpec}`, {
                paths: [projectRoot],
            });
        } catch {
            // Fallback to common locations
            const possiblePaths = [
                path.join(pluginPath, 'dist', contractSpec),
                path.join(pluginPath, 'lib', contractSpec),
                path.join(pluginPath, contractSpec),
            ];
            const found = possiblePaths.find((p) => fs.existsSync(p));
            return found || possiblePaths[0];
        }
    } else {
        // For local plugins, resolve relative to plugin directory
        return path.join(pluginPath, contractSpec);
    }
}

/**
 * Resolves the path to a .jay-action file.
 * For NPM packages, uses require.resolve (package exports).
 * For local plugins, resolves relative to plugin directory.
 */
function resolveActionFilePath(
    actionPath: string,
    packageName: string,
    pluginPath: string,
    isLocal: boolean,
    projectRoot: string,
): string | null {
    if (!isLocal && !actionPath.startsWith('.')) {
        // NPM package: resolve via package exports
        try {
            return require.resolve(`${packageName}/${actionPath}`, {
                paths: [projectRoot],
            });
        } catch {
            // Fallback to common locations
            const possiblePaths = [
                path.join(pluginPath, 'dist', actionPath),
                path.join(pluginPath, 'lib', actionPath),
                path.join(pluginPath, actionPath),
            ];
            const found = possiblePaths.find((p) => fs.existsSync(p));
            return found || null;
        }
    }

    // Local plugin or relative path
    const resolved = resolveActionMetadataPath(actionPath, pluginPath);
    return fs.existsSync(resolved) ? resolved : null;
}

// ============================================================================
// Utilities
// ============================================================================

function toKebabCase(str: string): string {
    return str
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');
}

// ============================================================================
// Main Materialization Function
// ============================================================================

/**
 * Materializes all contracts (static references + dynamic generated) to disk.
 *
 * @param options - Materialization options
 * @param services - Map of service markers to service instances (from init.ts)
 */
export async function materializeContracts(
    options: MaterializeContractsOptions,
    services: Map<symbol, unknown> = new Map(),
): Promise<MaterializeResult> {
    const {
        projectRoot,
        outputDir = path.join(projectRoot, 'agent-kit', 'materialized-contracts'),
        dynamicOnly = false,
        pluginFilter,
        verbose = false,
        viteServer,
    } = options;

    /** Per-plugin data for plugins-index.yaml (Design Log #85) */
    const pluginsIndexMap = new Map<
        string,
        {
            path: string;
            contracts: PluginContractEntry[];
            actions: ActionIndexEntry[];
        }
    >();
    let staticCount = 0;
    let dynamicCount = 0;

    // Scan for plugins using shared scanner
    if (verbose) {
        getLogger().info('Scanning for plugins...');
    }
    const plugins = await scanPlugins({
        projectRoot,
        verbose,
        includeDevDeps: true, // Include dev deps for contract discovery
    });

    if (verbose) {
        getLogger().info(`Found ${plugins.size} plugin(s)`);
    }

    for (const [pluginKey, plugin] of plugins) {
        // Filter to specific plugin if requested
        if (pluginFilter && plugin.name !== pluginFilter && pluginKey !== pluginFilter) continue;

        if (verbose) {
            getLogger().info(`\n📦 Processing plugin: ${plugin.name}`);
        }

        const { manifest } = plugin;

        // Ensure plugin entry exists in plugins index
        const pluginRelPath = path.relative(projectRoot, plugin.pluginPath);
        if (!pluginsIndexMap.has(plugin.name)) {
            pluginsIndexMap.set(plugin.name, {
                path: './' + pluginRelPath.replace(/\\/g, '/'),
                contracts: [],
                actions: [],
            });
        }

        // Add static contracts to index
        if (!dynamicOnly && manifest.contracts) {
            for (const contract of manifest.contracts) {
                const contractPath = resolveStaticContractPath(
                    plugin,
                    contract.contract,
                    projectRoot,
                );

                // Make path relative to project root for portability
                const relativePath = path.relative(projectRoot, contractPath);
                pluginsIndexMap.get(plugin.name)!.contracts.push({
                    name: contract.name,
                    type: 'static',
                    path: './' + relativePath,
                });
                staticCount++;

                if (verbose) {
                    getLogger().info(`   📄 Static: ${contract.name}`);
                }
            }
        }

        // Materialize dynamic contracts
        if (manifest.dynamic_contracts) {
            // Normalize to array
            const dynamicConfigs = Array.isArray(manifest.dynamic_contracts)
                ? manifest.dynamic_contracts
                : [manifest.dynamic_contracts];

            // Create plugin output directory
            const pluginOutputDir = path.join(outputDir, plugin.name.replace(/[@/]/g, '_'));
            fs.mkdirSync(pluginOutputDir, { recursive: true });

            for (const config of dynamicConfigs) {
                if (verbose) {
                    getLogger().info(`   ⚡ Dynamic contracts (prefix: ${config.prefix})`);
                }

                try {
                    const generatedContracts = await executeDynamicGenerator(
                        plugin,
                        config,
                        projectRoot,
                        services,
                        verbose,
                        viteServer,
                    );

                    const prefix = config.prefix;

                    for (const generated of generatedContracts) {
                        const fullName = `${prefix}/${toKebabCase(generated.name)}`;
                        const fileName = `${prefix}-${toKebabCase(generated.name)}.jay-contract`;
                        const filePath = path.join(pluginOutputDir, fileName);

                        // Write the contract file
                        fs.writeFileSync(filePath, generated.yaml, 'utf-8');

                        // Make path relative to project root
                        const relativePath = path.relative(projectRoot, filePath);

                        const contractEntry: PluginContractEntry = {
                            name: fullName,
                            type: 'dynamic',
                            path: './' + relativePath,
                            ...(generated.metadata && { metadata: generated.metadata }),
                        };
                        pluginsIndexMap.get(plugin.name)!.contracts.push(contractEntry);
                        dynamicCount++;

                        if (verbose) {
                            getLogger().info(`   ⚡ Materialized: ${fullName}`);
                        }
                    }
                } catch (error) {
                    getLogger().error(
                        `   ❌ Failed to materialize dynamic contracts for ${plugin.name} (${config.prefix}): ${error}`,
                    );
                    // Continue with other generators
                }
            }
        }

        // Collect action metadata from .jay-action files (Design Log #92)
        if (manifest.actions && Array.isArray(manifest.actions)) {
            for (const entry of manifest.actions) {
                const { name: actionName, action: actionPath } = normalizeActionEntry(entry);
                if (!actionPath) continue; // No .jay-action file — skip

                const metadataFilePath = resolveActionFilePath(
                    actionPath,
                    plugin.packageName,
                    plugin.pluginPath,
                    plugin.isLocal,
                    projectRoot,
                );
                if (!metadataFilePath) continue;
                const metadata = loadActionMetadata(metadataFilePath);
                if (!metadata) continue;

                const actionRelPath = path.relative(projectRoot, metadataFilePath);
                pluginsIndexMap.get(plugin.name)!.actions.push({
                    name: metadata.name,
                    description: metadata.description,
                    path: './' + actionRelPath.replace(/\\/g, '/'),
                });

                if (verbose) {
                    getLogger().info(`   🔧 Action: ${metadata.name} (${actionPath})`);
                }
            }
        }
    }

    // Write plugins-index.yaml (single index file — Design Log #85)
    const pluginsIndex: PluginsIndex = {
        plugins: Array.from(pluginsIndexMap.entries()).map(([name, data]) => ({
            name,
            path: data.path,
            contracts: data.contracts,
            ...(data.actions.length > 0 && { actions: data.actions }),
        })),
    };

    fs.mkdirSync(outputDir, { recursive: true });
    // Write plugins-index.yaml to agent-kit/ root (parent of materialized-contracts/)
    const agentKitDir = path.dirname(outputDir);
    const pluginsIndexPath = path.join(agentKitDir, 'plugins-index.yaml');
    fs.writeFileSync(pluginsIndexPath, YAML.stringify(pluginsIndex), 'utf-8');

    if (verbose) {
        getLogger().info(`\n✅ Plugins index written to: ${pluginsIndexPath}`);
    }

    return {
        pluginsIndex,
        staticCount,
        dynamicCount,
        outputDir,
    };
}

/**
 * Lists contracts without writing files (for --list mode)
 */
export async function listContracts(options: MaterializeContractsOptions): Promise<PluginsIndex> {
    const { projectRoot, dynamicOnly = false, pluginFilter } = options;

    const pluginsMap = new Map<string, { path: string; contracts: PluginContractEntry[] }>();

    // Scan for plugins using shared scanner
    const plugins = await scanPlugins({
        projectRoot,
        includeDevDeps: true,
    });

    for (const [pluginKey, plugin] of plugins) {
        if (pluginFilter && plugin.name !== pluginFilter && pluginKey !== pluginFilter) continue;

        const { manifest } = plugin;
        const pluginRelPath = path.relative(projectRoot, plugin.pluginPath);
        if (!pluginsMap.has(plugin.name)) {
            pluginsMap.set(plugin.name, {
                path: './' + pluginRelPath.replace(/\\/g, '/'),
                contracts: [],
            });
        }

        // Add static contracts
        if (!dynamicOnly && manifest.contracts) {
            for (const contract of manifest.contracts) {
                const contractPath = resolveStaticContractPath(
                    plugin,
                    contract.contract,
                    projectRoot,
                );

                const relativePath = path.relative(projectRoot, contractPath);

                pluginsMap.get(plugin.name)!.contracts.push({
                    name: contract.name,
                    type: 'static',
                    path: './' + relativePath,
                });
            }
        }

        // Note: For listing, we don't execute dynamic generators
        // (they may require services that aren't available)
        // Just indicate that dynamic contracts exist
        if (manifest.dynamic_contracts) {
            // Normalize to array
            const dynamicConfigs = Array.isArray(manifest.dynamic_contracts)
                ? manifest.dynamic_contracts
                : [manifest.dynamic_contracts];

            for (const config of dynamicConfigs) {
                pluginsMap.get(plugin.name)!.contracts.push({
                    name: `${config.prefix}/*`,
                    type: 'dynamic',
                    path: '(run materialization to generate)',
                });
            }
        }
    }

    return {
        plugins: Array.from(pluginsMap.entries()).map(([name, data]) => ({
            name,
            path: data.path,
            contracts: data.contracts,
        })),
    };
}
