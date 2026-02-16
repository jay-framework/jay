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
    GeneratedContractYaml,
    DynamicContractGenerator,
} from '@jay-framework/fullstack-component';
import { type DynamicContractConfig, normalizeActionEntry } from '@jay-framework/compiler-shared';
import { createRequire } from 'module';
import { scanPlugins, type ScannedPlugin } from './plugin-scanner';
import type { ViteSSRLoader } from './action-discovery';
import { getLogger } from '@jay-framework/logger';
import {
    loadActionMetadata,
    resolveActionMetadataPath,
    type ActionMetadata,
} from './action-metadata';

const require = createRequire(import.meta.url);

// ============================================================================
// Types
// ============================================================================

export interface ContractIndexEntry {
    plugin: string;
    name: string;
    type: 'static' | 'dynamic';
    path: string;
    metadata?: Record<string, unknown>;
}

export interface ContractsIndex {
    materialized_at: string;
    jay_stack_version: string;
    contracts: ContractIndexEntry[];
}

/** Action metadata entry in plugins-index.yaml */
export interface ActionIndexEntry {
    name: string;
    description: string;
    inputSchema: ActionMetadata['inputSchema'];
    outputSchema?: ActionMetadata['outputSchema'];
}

/** Entry for plugins-index.yaml (Design Log #85) */
export interface PluginsIndexEntry {
    name: string;
    path: string;
    contracts: Array<{ name: string; type: 'static' | 'dynamic'; path: string }>;
    /** Actions with .jay-action metadata (exposed to AI agents) */
    actions?: ActionIndexEntry[];
}

export interface PluginsIndex {
    materialized_at: string;
    jay_stack_version: string;
    plugins: PluginsIndexEntry[];
}

export interface MaterializeContractsOptions {
    projectRoot: string;
    outputDir?: string; // defaults to build/materialized-contracts
    force?: boolean;
    dynamicOnly?: boolean;
    pluginFilter?: string;
    verbose?: boolean;
    /** Optional Vite server for TypeScript support */
    viteServer?: ViteSSRLoader;
}

export interface MaterializeResult {
    index: ContractsIndex;
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

    const result = await generator.generate(...resolvedServices);
    return result;
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

// ============================================================================
// Utilities
// ============================================================================

function toKebabCase(str: string): string {
    return str
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');
}

function getJayStackVersion(): string {
    try {
        const packageJsonPath = path.join(__dirname, '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return packageJson.version || '0.0.0';
    } catch {
        return '0.0.0';
    }
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
        outputDir = path.join(projectRoot, 'build', 'materialized-contracts'),
        dynamicOnly = false,
        pluginFilter,
        verbose = false,
        viteServer,
    } = options;

    const contracts: ContractIndexEntry[] = [];
    /** Per-plugin data for plugins-index.yaml (Design Log #85) */
    const pluginsIndexMap = new Map<
        string,
        {
            path: string;
            contracts: Array<{ name: string; type: 'static' | 'dynamic'; path: string }>;
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
                const entry: ContractIndexEntry = {
                    plugin: plugin.name,
                    name: contract.name,
                    type: 'static',
                    path: './' + relativePath,
                };
                contracts.push(entry);
                staticCount++;

                // Collect for plugins index
                const pluginRelPath = path.relative(projectRoot, plugin.pluginPath);
                if (!pluginsIndexMap.has(plugin.name)) {
                    pluginsIndexMap.set(plugin.name, {
                        path: './' + pluginRelPath.replace(/\\/g, '/'),
                        contracts: [],
                        actions: [],
                    });
                }
                pluginsIndexMap.get(plugin.name)!.contracts.push({
                    name: contract.name,
                    type: 'static',
                    path: './' + relativePath,
                });

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

                        const dynEntry: ContractIndexEntry = {
                            plugin: plugin.name,
                            name: fullName,
                            type: 'dynamic',
                            path: './' + relativePath,
                            metadata: generated.metadata,
                        };
                        contracts.push(dynEntry);
                        dynamicCount++;

                        // Collect for plugins index
                        const pluginRelPath = path.relative(projectRoot, plugin.pluginPath);
                        if (!pluginsIndexMap.has(plugin.name)) {
                            pluginsIndexMap.set(plugin.name, {
                                path: './' + pluginRelPath.replace(/\\/g, '/'),
                                contracts: [],
                                actions: [],
                            });
                        }
                        pluginsIndexMap.get(plugin.name)!.contracts.push({
                            name: fullName,
                            type: 'dynamic',
                            path: './' + relativePath,
                        });

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

                const metadataFilePath = resolveActionMetadataPath(actionPath, plugin.pluginPath);
                const metadata = loadActionMetadata(metadataFilePath);
                if (!metadata) continue;

                // Ensure plugin entry exists in plugins index
                const pluginRelPath = path.relative(projectRoot, plugin.pluginPath);
                if (!pluginsIndexMap.has(plugin.name)) {
                    pluginsIndexMap.set(plugin.name, {
                        path: './' + pluginRelPath.replace(/\\/g, '/'),
                        contracts: [],
                        actions: [],
                    });
                }

                pluginsIndexMap.get(plugin.name)!.actions.push({
                    name: metadata.name,
                    description: metadata.description,
                    inputSchema: metadata.inputSchema,
                    ...(metadata.outputSchema && { outputSchema: metadata.outputSchema }),
                });

                if (verbose) {
                    getLogger().info(`   🔧 Action: ${metadata.name} (${actionPath})`);
                }
            }
        }
    }

    // Write index file (YAML format)
    const index: ContractsIndex = {
        materialized_at: new Date().toISOString(),
        jay_stack_version: getJayStackVersion(),
        contracts,
    };

    fs.mkdirSync(outputDir, { recursive: true });
    const indexPath = path.join(outputDir, 'contracts-index.yaml');
    fs.writeFileSync(indexPath, YAML.stringify(index), 'utf-8');

    // Write plugins-index.yaml (Design Log #85 - agent kit)
    const pluginsIndex: PluginsIndex = {
        materialized_at: index.materialized_at,
        jay_stack_version: index.jay_stack_version,
        plugins: Array.from(pluginsIndexMap.entries()).map(([name, data]) => ({
            name,
            path: data.path,
            contracts: data.contracts,
            ...(data.actions.length > 0 && { actions: data.actions }),
        })),
    };
    const pluginsIndexPath = path.join(outputDir, 'plugins-index.yaml');
    fs.writeFileSync(pluginsIndexPath, YAML.stringify(pluginsIndex), 'utf-8');

    if (verbose) {
        getLogger().info(`\n✅ Contracts index written to: ${indexPath}`);
        getLogger().info(`✅ Plugins index written to: ${pluginsIndexPath}`);
    }

    return {
        index,
        staticCount,
        dynamicCount,
        outputDir,
    };
}

/**
 * Lists contracts without writing files (for --list mode)
 */
export async function listContracts(options: MaterializeContractsOptions): Promise<ContractsIndex> {
    const { projectRoot, dynamicOnly = false, pluginFilter } = options;

    const contracts: ContractIndexEntry[] = [];

    // Scan for plugins using shared scanner
    const plugins = await scanPlugins({
        projectRoot,
        includeDevDeps: true,
    });

    for (const [pluginKey, plugin] of plugins) {
        if (pluginFilter && plugin.name !== pluginFilter && pluginKey !== pluginFilter) continue;

        const { manifest } = plugin;

        // Add static contracts
        if (!dynamicOnly && manifest.contracts) {
            for (const contract of manifest.contracts) {
                const contractPath = resolveStaticContractPath(
                    plugin,
                    contract.contract,
                    projectRoot,
                );

                const relativePath = path.relative(projectRoot, contractPath);

                contracts.push({
                    plugin: plugin.name,
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
                contracts.push({
                    plugin: plugin.name,
                    name: `${config.prefix}/*`,
                    type: 'dynamic',
                    path: '(run materialization to generate)',
                });
            }
        }
    }

    return {
        materialized_at: new Date().toISOString(),
        jay_stack_version: getJayStackVersion(),
        contracts,
    };
}
