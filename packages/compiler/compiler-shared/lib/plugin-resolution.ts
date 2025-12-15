import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { WithValidations } from './with-validations';

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
 * @returns Resolution result with validation messages
 */
export function resolveLocalPlugin(
    projectRoot: string,
    pluginName: string,
    contractName: string,
): WithValidations<PluginComponentResolution> | null {
    const localPluginPath = path.join(projectRoot, 'src/plugins', pluginName);
    const pluginYamlPath = path.join(localPluginPath, 'plugin.yaml');
    
    if (!fs.existsSync(localPluginPath)) {
        return null; // Not found locally, will try NPM
    }
    
    if (!fs.existsSync(pluginYamlPath)) {
        return new WithValidations(
            null as any,
            [`Local plugin "${pluginName}" found at ${localPluginPath} but plugin.yaml is missing`]
        );
    }
    
    const manifest = loadPluginManifest(localPluginPath);
    
    if (!manifest) {
        return new WithValidations(
            null as any,
            [`Failed to parse plugin.yaml for local plugin "${pluginName}" at ${pluginYamlPath}`]
        );
    }
    
    if (!manifest.contracts || manifest.contracts.length === 0) {
        return new WithValidations(
            null as any,
            [`Local plugin "${pluginName}" has no contracts defined in plugin.yaml`]
        );
    }
    
    const contract = manifest.contracts.find((c) => c.name === contractName);
    if (!contract) {
        const availableContracts = manifest.contracts.map(c => c.name).join(', ');
        return new WithValidations(
            null as any,
            [`Contract "${contractName}" not found in local plugin "${pluginName}". Available contracts: ${availableContracts}`]
        );
    }
    
    return new WithValidations({
        contractPath: path.join(localPluginPath, contract.contract),
        componentPath: path.join(localPluginPath, contract.component),
        componentName: contractName,
    }, []);
}

/**
 * Resolves a plugin component from an NPM package (node_modules/)
 * 
 * @param projectRoot - Project root directory
 * @param pluginName - Name of the NPM package
 * @param contractName - Name of the contract to resolve
 * @returns Resolution result with validation messages
 */
export function resolveNpmPlugin(
    projectRoot: string,
    pluginName: string,
    contractName: string,
): WithValidations<PluginComponentResolution> | null {
    const npmPluginPath = path.join(projectRoot, 'node_modules', pluginName);
    
    if (!fs.existsSync(npmPluginPath)) {
        return null; // Not found in NPM either
    }
    
    const pluginYamlPath = path.join(npmPluginPath, 'plugin.yaml');
    
    if (!fs.existsSync(pluginYamlPath)) {
        return new WithValidations(
            null as any,
            [`NPM package "${pluginName}" found but plugin.yaml is missing. Is this a Jay Stack plugin?`]
        );
    }
    
    const manifest = loadPluginManifest(npmPluginPath);
    
    if (!manifest) {
        return new WithValidations(
            null as any,
            [`Failed to parse plugin.yaml for NPM package "${pluginName}" at ${pluginYamlPath}`]
        );
    }
    
    if (!manifest.contracts || manifest.contracts.length === 0) {
        return new WithValidations(
            null as any,
            [`NPM package "${pluginName}" has no contracts defined in plugin.yaml`]
        );
    }
    
    const contract = manifest.contracts.find((c) => c.name === contractName);
    if (!contract) {
        const availableContracts = manifest.contracts.map(c => c.name).join(', ');
        return new WithValidations(
            null as any,
            [`Contract "${contractName}" not found in NPM package "${pluginName}". Available contracts: ${availableContracts}`]
        );
    }
    
    // For NPM packages, resolve paths through package.json exports
    const packageJsonPath = path.join(npmPluginPath, 'package.json');
    let resolvedContractPath: string;
    let resolvedComponentPath: string;
    const warnings: string[] = [];
    
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
                warnings.push(`NPM package "${pluginName}" has no exports field in package.json. Using direct path resolution.`);
            }
        } catch (error) {
            // Fallback to direct paths
            resolvedContractPath = path.join(npmPluginPath, contract.contract);
            resolvedComponentPath = path.join(npmPluginPath, contract.component);
            warnings.push(`Failed to parse package.json for "${pluginName}": ${error}. Using direct path resolution.`);
        }
    } else {
        resolvedContractPath = path.join(npmPluginPath, contract.contract);
        resolvedComponentPath = path.join(npmPluginPath, contract.component);
        warnings.push(`NPM package "${pluginName}" has no package.json. Using direct path resolution.`);
    }
    
    return new WithValidations({
        contractPath: resolvedContractPath,
        componentPath: resolvedComponentPath,
        componentName: contractName,
    }, warnings);
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
    if (localResult !== null) {
        return localResult; // Found locally (success or error)
    }
    
    // Try NPM packages
    const npmResult = resolveNpmPlugin(projectRoot, pluginName, contractName);
    if (npmResult !== null) {
        return npmResult; // Found in NPM (success or error)
    }
    
    // Not found anywhere
    return new WithValidations(
        null as any,
        [
            `Plugin "${pluginName}" not found. ` +
            `Searched in src/plugins/${pluginName}/ and node_modules/${pluginName}/. ` +
            `Ensure the plugin is installed or exists in your project.`
        ]
    );
}

