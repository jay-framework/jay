import { Contract, parseContract } from '../contract';
import {
    analyzeExportedTypes,
    ResolveTsConfigOptions,
} from '@jay-framework/compiler-analyze-exported-types';
import { JayType, WithValidations } from '@jay-framework/compiler-shared';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import YAML from 'yaml';

const require = createRequire(import.meta.url);

export interface PluginComponentResolution {
    contractPath: string;
    componentPath: string;
    componentName: string;
}

export interface JayImportResolver {
    resolveLink(importingModuleDir: string, link: string): string;
    loadContract(fullPath: string): WithValidations<Contract>;
    analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[];
    resolvePluginComponent(pluginName: string, contractName: string, projectRoot: string): PluginComponentResolution | null;
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
    resolvePluginComponent(pluginName: string, contractName: string, projectRoot: string): PluginComponentResolution | null {
        // Try local plugins first (src/plugins/)
        const localPluginPath = path.join(projectRoot, 'src/plugins', pluginName);
        const localPluginYaml = path.join(localPluginPath, 'plugin.yaml');
        
        if (fs.existsSync(localPluginYaml)) {
            try {
                const yamlContent = fs.readFileSync(localPluginYaml, 'utf-8');
                const manifest = YAML.parse(yamlContent);
                
                // Check static contracts
                if (manifest.contracts) {
                    const contract = manifest.contracts.find((c: any) => c.name === contractName);
                    if (contract) {
                        return {
                            contractPath: path.join(localPluginPath, contract.contract),
                            componentPath: path.join(localPluginPath, contract.component),
                            componentName: contractName,
                        };
                    }
                }
                
                // Check dynamic contracts (prefix-based)
                if (manifest.dynamic_contracts && contractName.startsWith(manifest.dynamic_contracts.prefix + '/')) {
                    // TODO: Dynamic contracts not yet supported in jay-html parser
                    // Will need to run generator at build time and cache results
                    return null;
                }
            } catch (error) {
                // Invalid plugin.yaml
                return null;
            }
        }
        
        // Try npm package (node_modules/)
        // TODO: Add npm package resolution using package.json exports
        
        return null;
    },
};
