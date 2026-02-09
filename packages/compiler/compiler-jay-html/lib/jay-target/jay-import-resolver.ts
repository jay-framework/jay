import { Contract, parseContract } from '../contract';
import {
    analyzeExportedTypes,
    ResolveTsConfigOptions,
} from '@jay-framework/compiler-analyze-exported-types';
import {
    JayType,
    WithValidations,
    resolvePluginComponent as resolvePlugin,
    PluginComponentResolution,
} from '@jay-framework/compiler-shared';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import YAML from 'yaml';

const require = createRequire(import.meta.url);

export type { PluginComponentResolution };

export interface JayImportResolver {
    resolveLink(importingModuleDir: string, link: string): string;
    /** Load a contract from an absolute file path */
    loadContract(fullPath: string): WithValidations<Contract>;
    analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[];
    resolvePluginComponent(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<PluginComponentResolution>;
    /**
     * Load a contract from a plugin, handling both static and dynamic contracts.
     * For static contracts, loads from the plugin's contract file.
     * For dynamic contracts, loads from materialized location (build/materialized-contracts/).
     *
     * Returns the contract, path, and optional metadata (for dynamic contracts).
     */
    loadPluginContract(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<{
        contract: Contract;
        contractPath: string;
        metadata?: Record<string, unknown>;
    }>;
}

export const JAY_IMPORT_RESOLVER: JayImportResolver = {
    analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[] {
        return analyzeExportedTypes(fullPath, options);
    },
    loadContract(fullPath: string): WithValidations<Contract> {
        const content = fs.readFileSync(fullPath).toString();
        return parseContract(content, fullPath);
    },
    resolveLink(importingModuleDir: string, link: string): string {
        if (link?.[0] === '.') return path.resolve(importingModuleDir, link);
        else return require.resolve(link, { paths: require.resolve.paths(importingModuleDir) });
    },
    resolvePluginComponent(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<PluginComponentResolution> {
        // Use shared plugin resolution logic from compiler-shared
        // This handles both local plugins (src/plugins/) and NPM packages (node_modules/)
        return resolvePlugin(projectRoot, pluginName, contractName);
    },
    loadPluginContract(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<{ contract: Contract; contractPath: string }> {
        // First, try to resolve as static contract
        const resolution = resolvePlugin(projectRoot, pluginName, contractName);

        if (resolution.val && resolution.val.contractPath) {
            // Static contract - load from resolved path
            const contractPath = resolution.val.contractPath;
            const content = fs.readFileSync(contractPath).toString();
            const contractResult = parseContract(content, contractPath);
            return contractResult.map((contract) => ({ contract, contractPath }));
        }

        // Dynamic contract - try materialized location
        // Contract name format: "prefix/name" (e.g., "list/recipes-list")
        const materializedDir = path.join(projectRoot, 'build/materialized-contracts');

        // Convert plugin name to directory name (e.g., "@jay-framework/wix-data" -> "wix-data")
        const pluginDir = pluginName.startsWith('@')
            ? pluginName.split('/').pop() || pluginName
            : pluginName;

        // Convert contract name to filename (e.g., "list/recipes-list" -> "list-recipes-list.jay-contract")
        const contractFileName = contractName.replace(/\//g, '-') + '.jay-contract';
        const materializedPath = path.join(materializedDir, pluginDir, contractFileName);

        if (fs.existsSync(materializedPath)) {
            const content = fs.readFileSync(materializedPath).toString();
            const contractResult = parseContract(content, materializedPath);

            // Try to load metadata from contracts-index.yaml
            let metadata: Record<string, unknown> | undefined;
            const indexPath = path.join(materializedDir, 'contracts-index.yaml');
            if (fs.existsSync(indexPath)) {
                try {
                    const indexContent = fs.readFileSync(indexPath, 'utf-8');
                    const index = YAML.parse(indexContent);
                    // Index stores short plugin name (e.g., "wix-data"), but pluginName might be
                    // the full npm package name (e.g., "@jay-framework/wix-data")
                    const entry = index.contracts?.find(
                        (c: { plugin: string; name: string }) =>
                            (c.plugin === pluginName || c.plugin === pluginDir) &&
                            c.name === contractName,
                    );
                    metadata = entry?.metadata;
                } catch {
                    // Ignore errors reading index - metadata is optional
                }
            }

            return contractResult.map((contract) => ({
                contract,
                contractPath: materializedPath,
                metadata,
            }));
        }

        // Not found - return validation error
        return new WithValidations(null as any, [
            `Contract "${contractName}" not found for plugin "${pluginName}". ` +
                `For dynamic contracts, run 'jay-stack agent-kit' to materialize them first.`,
        ]);
    },
};
