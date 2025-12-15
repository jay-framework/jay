import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

/**
 * Plugin manifest structure (contracts section only - subset of full PluginManifest)
 */
export interface PluginManifest {
    name: string;
    module?: string;
    contracts?: Array<{
        name: string;
        contract: string;
        component: string;
        description?: string;
    }>;
    dynamic_contracts?: {
        generator: string;
        component: string;
        prefix: string;
    };
}

/**
 * Result of resolving a plugin component
 */
export interface PluginComponentResolution {
    /** Absolute path to the contract file */
    contractPath: string;
    /** Absolute path to the component file (without extension) */
    componentPath: string;
    /** Component name to import */
    componentName: string;
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
 * Resolves a plugin component from a local plugin directory (src/plugins/)
 * 
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the plugin
 * @param contractName - Name of the contract to resolve
 * @returns Resolution result or null if not found
 */
export function resolveLocalPlugin(
    projectRoot: string,
    pluginName: string,
    contractName: string,
): PluginComponentResolution | null {
    const localPluginPath = path.join(projectRoot, 'src/plugins', pluginName);
    const manifest = loadPluginManifest(localPluginPath);
    
    if (!manifest || !manifest.contracts) {
        return null;
    }
    
    const contract = manifest.contracts.find((c) => c.name === contractName);
    if (!contract) {
        return null;
    }
    
    return {
        contractPath: path.join(localPluginPath, contract.contract),
        componentPath: path.join(localPluginPath, contract.component),
        componentName: contractName,
    };
}

/**
 * Resolves a plugin component from an NPM package (node_modules/)
 * 
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the NPM package
 * @param contractName - Name of the contract to resolve
 * @returns Resolution result or null if not found
 */
export function resolveNpmPlugin(
    projectRoot: string,
    pluginName: string,
    contractName: string,
): PluginComponentResolution | null {
    const npmPluginPath = path.join(projectRoot, 'node_modules', pluginName);
    
    if (!fs.existsSync(npmPluginPath)) {
        return null;
    }
    
    const manifest = loadPluginManifest(npmPluginPath);
    
    if (!manifest || !manifest.contracts) {
        return null;
    }
    
    const contract = manifest.contracts.find((c) => c.name === contractName);
    if (!contract) {
        return null;
    }
    
    // For NPM packages, resolve paths through package.json exports
    const packageJsonPath = path.join(npmPluginPath, 'package.json');
    let resolvedContractPath: string;
    let resolvedComponentPath: string;
    
    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            
            // Try to resolve contract through exports
            const contractExportKey = `./contracts/${contract.contract}`;
            if (packageJson.exports && packageJson.exports[contractExportKey]) {
                resolvedContractPath = path.join(npmPluginPath, packageJson.exports[contractExportKey]);
            } else {
                resolvedContractPath = path.join(npmPluginPath, contract.contract);
            }
            
            // Try to resolve component through exports or module field
            if (packageJson.exports && packageJson.exports['.']) {
                // If exports["."]. default exists, use directory from that
                const mainExport = packageJson.exports['.'];
                const mainPath = typeof mainExport === 'string' ? mainExport : mainExport.default || mainExport.import;
                if (mainPath) {
                    const mainDir = path.dirname(path.join(npmPluginPath, mainPath));
                    resolvedComponentPath = path.join(mainDir, path.basename(contract.component));
                } else {
                    resolvedComponentPath = path.join(npmPluginPath, contract.component);
                }
            } else if (manifest.module) {
                // Use module field from plugin.yaml
                const moduleDir = path.dirname(path.join(npmPluginPath, manifest.module));
                resolvedComponentPath = path.join(moduleDir, path.basename(contract.component));
            } else {
                resolvedComponentPath = path.join(npmPluginPath, contract.component);
            }
        } catch (error) {
            // Fallback to direct paths
            resolvedContractPath = path.join(npmPluginPath, contract.contract);
            resolvedComponentPath = path.join(npmPluginPath, contract.component);
        }
    } else {
        resolvedContractPath = path.join(npmPluginPath, contract.contract);
        resolvedComponentPath = path.join(npmPluginPath, contract.component);
    }
    
    return {
        contractPath: resolvedContractPath,
        componentPath: resolvedComponentPath,
        componentName: contractName,
    };
}

/**
 * Resolves a plugin component, trying local plugins first, then NPM packages
 * 
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the plugin
 * @param contractName - Name of the contract to resolve
 * @returns Resolution result or null if not found
 */
export function resolvePluginComponent(
    projectRoot: string,
    pluginName: string,
    contractName: string,
): PluginComponentResolution | null {
    // Try local plugins first
    const localResult = resolveLocalPlugin(projectRoot, pluginName, contractName);
    if (localResult) {
        return localResult;
    }
    
    // Try NPM packages
    return resolveNpmPlugin(projectRoot, pluginName, contractName);
}

