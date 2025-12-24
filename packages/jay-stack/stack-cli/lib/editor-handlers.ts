import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
import { parse } from 'node-html-parser';
import { createRequire } from 'module';
import type {
    PublishMessage,
    PublishComponent,
    PublishPage,
    PublishResponse,
    PublishStatus,
    SaveImageMessage,
    HasImageMessage,
    GetProjectInfoMessage,
    SaveImageResponse,
    HasImageResponse,
    GetProjectInfoResponse,
    ProjectInfo,
    ProjectPage,
    ProjectComponent,
    ContractTag as ProtocolContractTag,
    ContractSchema,
    Plugin,
    PluginManifest,
    PluginContractsByType,
    PluginPageContract,
    PluginComponentContract,
    ExportDesignMessage,
    ImportDesignMessage,
    ExportDesignResponse,
    ImportDesignResponse,
} from '@jay-framework/editor-protocol';
import { resolvePluginComponent } from '@jay-framework/compiler-shared';
import { designAdapterRegistry } from '@jay-framework/dev-server';
import type { JayConfig } from './config';
import {
    generateElementDefinitionFile,
    JAY_IMPORT_RESOLVER,
    parseJayFile,
    parseContract,
    ContractTag,
    ContractTagType,
} from '@jay-framework/compiler-jay-html';
import {
    JayType,
    JayEnumType,
    JayAtomicType,
    JAY_EXTENSION,
    JAY_CONTRACT_EXTENSION,
} from '@jay-framework/compiler-shared';

const PAGE_FILENAME = `page${JAY_EXTENSION}`;
const PAGE_CONTRACT_FILENAME = `page${JAY_CONTRACT_EXTENSION}`;
const PAGE_CONFIG_FILENAME = 'page.conf.yaml';

// Helper function to convert JayType to string representation
function jayTypeToString(jayType: JayType | undefined): string | undefined {
    if (!jayType) return undefined;

    if (jayType instanceof JayAtomicType) {
        return jayType.name;
    } else if (jayType instanceof JayEnumType) {
        return `enum (${jayType.values.join(' | ')})`;
    } else {
        // For other types, try to get a string representation
        return (jayType as any).name || 'unknown';
    }
}

// Helper function to convert ContractTag to protocol format
function convertContractTagToProtocol(tag: ContractTag): ProtocolContractTag {
    const protocolTag: ProtocolContractTag = {
        tag: tag.tag,
        type:
            tag.type.length === 1
                ? ContractTagType[tag.type[0]]
                : tag.type.map((t) => ContractTagType[t]),
    };

    if (tag.dataType) {
        protocolTag.dataType = jayTypeToString(tag.dataType);
    }

    if (tag.elementType) {
        protocolTag.elementType = tag.elementType.join(' | ');
    }

    if (tag.required !== undefined) {
        protocolTag.required = tag.required;
    }

    if (tag.repeated !== undefined) {
        protocolTag.repeated = tag.repeated;
    }

    if (tag.link) {
        protocolTag.link = tag.link;
    }

    if (tag.tags) {
        protocolTag.tags = tag.tags.map(convertContractTagToProtocol);
    }

    return protocolTag;
}

// Helper function to check if a directory is a page
// A directory is a page if it has .jay-html OR .jay-contract OR page.conf.yaml
function isPageDirectory(entries: fs.Dirent[]): {
    isPage: boolean;
    hasPageHtml: boolean;
    hasPageContract: boolean;
    hasPageConfig: boolean;
} {
    const hasPageHtml = entries.some((e) => e.name === PAGE_FILENAME);
    const hasPageContract = entries.some((e) => e.name === PAGE_CONTRACT_FILENAME);
    const hasPageConfig = entries.some((e) => e.name === PAGE_CONFIG_FILENAME);
    const isPage = hasPageHtml || hasPageContract || hasPageConfig;

    return { isPage, hasPageHtml, hasPageContract, hasPageConfig };
}

// Generic page directory scanner that accepts a callback for processing each page
async function scanPageDirectories(
    pagesBasePath: string,
    onPageFound: (context: {
        dirPath: string;
        pageUrl: string;
        pageName: string;
        hasPageHtml: boolean;
        hasPageContract: boolean;
        hasPageConfig: boolean;
    }) => Promise<void>,
): Promise<void> {
    async function scanDirectory(dirPath: string, urlPath: string = '') {
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

            // Check if this directory is a page (has .jay-html OR .jay-contract OR page.conf.yaml)
            const { isPage, hasPageHtml, hasPageContract, hasPageConfig } =
                isPageDirectory(entries);

            if (isPage) {
                const pageUrl = urlPath || '/';
                // Get the page name from the current directory, but special case for root pages
                const pageName = dirPath === pagesBasePath ? 'Home' : path.basename(dirPath);

                await onPageFound({
                    dirPath,
                    pageUrl,
                    pageName,
                    hasPageHtml,
                    hasPageContract,
                    hasPageConfig,
                });
            }

            // Recursively scan subdirectories
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    // Handle parameterized routes like [slug]
                    const isParam = entry.name.startsWith('[') && entry.name.endsWith(']');
                    const segmentUrl = isParam ? `:${entry.name.slice(1, -1)}` : entry.name;
                    const newUrlPath = urlPath + '/' + segmentUrl;
                    await scanDirectory(fullPath, newUrlPath);
                }
            }
        } catch (error) {
            console.warn(`Failed to scan directory ${dirPath}:`, error);
        }
    }

    await scanDirectory(pagesBasePath);
}

// Helper function to scan page contracts (only checks for .jay-contract files, doesn't parse HTML)
// Helper function to parse a contract file and return ContractSchema
async function parseContractFile(contractFilePath: string): Promise<ContractSchema | null> {
    try {
        const contractYaml = await fs.promises.readFile(contractFilePath, 'utf-8');
        const parsedContract = parseContract(contractYaml, contractFilePath);

        if (parsedContract.validations.length > 0) {
            console.warn(
                `Contract validation errors in ${contractFilePath}:`,
                parsedContract.validations,
            );
        }

        if (parsedContract.val) {
            // Resolve any linked sub-contracts
            const resolvedTags = await resolveLinkedTags(
                parsedContract.val.tags,
                path.dirname(contractFilePath),
            );

            return {
                name: parsedContract.val.name,
                tags: resolvedTags,
            };
        }
    } catch (error) {
        console.warn(`Failed to parse contract file ${contractFilePath}:`, error);
    }
    return null;
}

// Helper function to recursively resolve linked sub-contracts
async function resolveLinkedTags(
    tags: ContractTag[],
    baseDir: string,
): Promise<ProtocolContractTag[]> {
    const resolvedTags: ProtocolContractTag[] = [];

    for (const tag of tags) {
        if (tag.link) {
            // This is a linked sub-contract - load it from the file
            try {
                const linkedPath = path.resolve(baseDir, tag.link);
                const linkedContract = await parseContractFile(linkedPath);

                if (linkedContract) {
                    // Create a sub-contract tag with the linked contract's tags
                    const resolvedTag: ProtocolContractTag = {
                        tag: tag.tag,
                        type:
                            tag.type.length === 1
                                ? ContractTagType[tag.type[0]]
                                : tag.type.map((t) => ContractTagType[t]),
                        tags: linkedContract.tags, // Use tags from linked contract
                    };

                    if (tag.required !== undefined) {
                        resolvedTag.required = tag.required;
                    }

                    if (tag.repeated !== undefined) {
                        resolvedTag.repeated = tag.repeated;
                    }

                    resolvedTags.push(resolvedTag);
                } else {
                    console.warn(`Failed to load linked contract: ${tag.link} from ${baseDir}`);
                    // Fall back to including the link reference
                    resolvedTags.push(convertContractTagToProtocol(tag));
                }
            } catch (error) {
                console.warn(`Error resolving linked contract ${tag.link}:`, error);
                // Fall back to including the link reference
                resolvedTags.push(convertContractTagToProtocol(tag));
            }
        } else if (tag.tags) {
            // This is an inline sub-contract - recursively resolve its tags
            const resolvedSubTags = await resolveLinkedTags(tag.tags, baseDir);
            const protocolTag = convertContractTagToProtocol(tag);
            protocolTag.tags = resolvedSubTags;
            resolvedTags.push(protocolTag);
        } else {
            // Regular tag (data, interactive, variant)
            resolvedTags.push(convertContractTagToProtocol(tag));
        }
    }

    return resolvedTags;
}

// resolveAppContractPath function removed - uses plugin resolution system

/**
 * Scans and loads all plugin contracts from the plugin system
 * Returns contracts grouped by plugin name and organized by type (pages vs components)
 */
async function scanPluginContracts(
    plugins: Plugin[],
    projectRootPath: string,
): Promise<{ [pluginName: string]: PluginContractsByType }> {
    const pluginContracts: { [pluginName: string]: PluginContractsByType } = {};

    for (const plugin of plugins) {
        const pluginName = plugin.manifest.name;
        
        const contracts: PluginContractsByType = {
            pages: [],
            components: [],
        };

        // Process pages from new structure
        if (plugin.manifest.pages) {
            for (const pageDef of plugin.manifest.pages) {
                try {
                    const resolution = resolvePluginComponent(
                        projectRootPath,
                        pluginName,
                        pageDef.name,
                    );

                    if (!resolution.val) {
                        console.warn(
                            `Failed to resolve plugin page ${pluginName}/${pageDef.name}:`,
                            resolution.validations,
                        );
                        continue;
                    }

                    const contractPath = resolution.val.contractPath;
                    
                    if (fs.existsSync(contractPath)) {
                        const contractSchema = await parseContractFile(contractPath);
                        if (contractSchema) {
                            contracts.pages.push({
                                contractName: pageDef.name,
                                contractSchema,
                                pluginName,
                                componentName: pageDef.component,
                                pageName: pageDef.name,
                                slugs: pageDef.slugs,
                            });
                        }
                    }
                } catch (error) {
                    console.warn(
                        `Failed to process page ${pageDef.name} for plugin ${pluginName}:`,
                        error,
                    );
                }
            }
        }

        // Process components from new structure
        if (plugin.manifest.components) {
            for (const componentDef of plugin.manifest.components) {
                try {
                    const resolution = resolvePluginComponent(
                        projectRootPath,
                        pluginName,
                        componentDef.name,
                    );

                    if (!resolution.val) {
                        console.warn(
                            `Failed to resolve plugin component ${pluginName}/${componentDef.name}:`,
                            resolution.validations,
                        );
                        continue;
                    }

                    const contractPath = resolution.val.contractPath;
                    
                    if (fs.existsSync(contractPath)) {
                        const contractSchema = await parseContractFile(contractPath);
                        if (contractSchema) {
                            contracts.components.push({
                                contractName: componentDef.name,
                                contractSchema,
                                pluginName,
                                componentName: componentDef.component,
                            });
                        }
                    }
                } catch (error) {
                    console.warn(
                        `Failed to process component ${componentDef.name} for plugin ${pluginName}:`,
                        error,
                    );
                }
            }
        }

        // Process legacy contracts (for backward compatibility during transition)
        if (plugin.manifest.contracts) {
            for (const contractDef of plugin.manifest.contracts) {
                try {
                    const resolution = resolvePluginComponent(
                        projectRootPath,
                        pluginName,
                        contractDef.name,
                    );

                    if (!resolution.val) {
                        console.warn(
                            `Failed to resolve plugin contract ${pluginName}/${contractDef.name}:`,
                            resolution.validations,
                        );
                        continue;
                    }

                    const contractPath = resolution.val.contractPath;
                    
                    if (fs.existsSync(contractPath)) {
                        const contractSchema = await parseContractFile(contractPath);
                        if (contractSchema) {
                            // Legacy contracts go to components by default
                            contracts.components.push({
                                contractName: contractDef.name,
                                contractSchema,
                                pluginName,
                                componentName: contractDef.component,
                            });
                        }
                    }
                } catch (error) {
                    console.warn(
                        `Failed to process legacy contract ${contractDef.name} for plugin ${pluginName}:`,
                        error,
                    );
                }
            }
        }

        // TODO: Handle dynamic contracts when implemented
        // if (plugin.manifest.dynamic_contracts) { ... }

        pluginContracts[pluginName] = contracts;
    }

    return pluginContracts;
}

/**
 * Extract headless components from jay-html using the new plugin/contract system
 * This replaces the old extractHeadlessComponents function
 */
async function extractHeadlessComponentsFromJayHtml(
    jayHtmlContent: string,
    fileName: string,
    dirName: string,
    projectRootPath: string,
): Promise<{
    appName: string;
    componentName: string;
    key: string;
}[]> {
    const resolvedComponents: {
        appName: string;
        componentName: string;
        key: string;
    }[] = [];

    try {
        // Parse HTML to find headless script tags with plugin/contract attributes
        const root = parse(jayHtmlContent);
        const headlessScripts = root.querySelectorAll('script[type="application/jay-headless"]');

        for (const script of headlessScripts) {
            const plugin = script.getAttribute('plugin') || '';
            const contract = script.getAttribute('contract') || '';
            const key = script.getAttribute('key') || '';

            if (plugin && contract && key) {
                resolvedComponents.push({
                    appName: plugin,
                    componentName: contract,
                    key,
                });
            } else {
                console.warn(
                    `Incomplete headless script tag in ${fileName}: ` +
                    `plugin="${plugin}" contract="${contract}" key="${key}"`
                );
            }
        }

        return resolvedComponents;
    } catch (error) {
        console.warn(`Failed to parse jay-html file ${fileName}:`, error);
        return [];
    }
}

// extractHeadlessComponents function removed - uses extractHeadlessComponentsFromJayHtml with plugin system

// Helper function to scan components in the project
async function scanProjectComponents(componentsBasePath: string): Promise<ProjectComponent[]> {
    const components: ProjectComponent[] = [];

    try {
        const entries = await fs.promises.readdir(componentsBasePath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(JAY_EXTENSION)) {
                const componentName = path.basename(entry.name, JAY_EXTENSION);
                const componentPath = path.join(componentsBasePath, entry.name);
                const contractPath = path.join(
                    componentsBasePath,
                    `${componentName}${JAY_CONTRACT_EXTENSION}`,
                );

                const hasContract = fs.existsSync(contractPath);

                components.push({
                    name: componentName,
                    filePath: componentPath,
                    contractPath: hasContract ? contractPath : undefined,
                });
            }
        }
    } catch (error) {
        console.warn(`Failed to scan components directory ${componentsBasePath}:`, error);
    }

    return components;
}

// scanInstalledApps and convertPluginsToInstalledApps functions removed - uses scanPlugins() instead

// Helper function to get project name from project.conf.yaml
async function getProjectName(configBasePath: string): Promise<string> {
    const projectConfigPath = path.join(configBasePath, 'project.conf.yaml');

    try {
        if (fs.existsSync(projectConfigPath)) {
            const configContent = await fs.promises.readFile(projectConfigPath, 'utf-8');
            const projectConfig = YAML.parse(configContent);
            return projectConfig.name || 'Unnamed Project';
        }
    } catch (error) {
        console.warn(`Failed to read project config ${projectConfigPath}:`, error);
    }

    return 'Unnamed Project';
}

/**
 * Scans for Jay Stack plugins in both src/plugins/ (local) and node_modules/ (npm packages)
 */
async function scanPlugins(projectRootPath: string): Promise<Plugin[]> {
    const plugins: Plugin[] = [];

    // 1. Scan local plugins in src/plugins/
    const localPluginsPath = path.join(projectRootPath, 'src/plugins');
    if (fs.existsSync(localPluginsPath)) {
        try {
            const pluginDirs = await fs.promises.readdir(localPluginsPath, { withFileTypes: true });

            for (const dir of pluginDirs) {
                if (!dir.isDirectory()) continue;

                const pluginPath = path.join(localPluginsPath, dir.name);
                const pluginYamlPath = path.join(pluginPath, 'plugin.yaml');

                if (fs.existsSync(pluginYamlPath)) {
                    try {
                        const yamlContent = await fs.promises.readFile(pluginYamlPath, 'utf-8');
                        const manifest: PluginManifest = YAML.parse(yamlContent);

                        plugins.push({
                            manifest,
                            location: {
                                type: 'local',
                                path: pluginPath,
                            },
                        });
                    } catch (error) {
                        console.warn(`Failed to parse plugin.yaml for ${dir.name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to scan local plugins directory ${localPluginsPath}:`, error);
        }
    }

    // 2. Scan npm package plugins in node_modules/
    const nodeModulesPath = path.join(projectRootPath, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
        try {
            // Check all @scoped and unscoped packages
            const topLevelDirs = await fs.promises.readdir(nodeModulesPath, {
                withFileTypes: true,
            });

            for (const entry of topLevelDirs) {
                if (!entry.isDirectory()) continue;

                const packageDirs: string[] = [];

                if (entry.name.startsWith('@')) {
                    // Scoped package - check subdirectories
                    const scopePath = path.join(nodeModulesPath, entry.name);
                    const scopedPackages = await fs.promises.readdir(scopePath, {
                        withFileTypes: true,
                    });

                    for (const scopedPkg of scopedPackages) {
                        if (scopedPkg.isDirectory()) {
                            packageDirs.push(path.join(scopePath, scopedPkg.name));
                        }
                    }
                } else {
                    // Unscoped package
                    packageDirs.push(path.join(nodeModulesPath, entry.name));
                }

                // Check each package for plugin.yaml
                for (const pkgPath of packageDirs) {
                    const pluginYamlPath = path.join(pkgPath, 'plugin.yaml');

                    if (fs.existsSync(pluginYamlPath)) {
                        try {
                            const yamlContent = await fs.promises.readFile(pluginYamlPath, 'utf-8');
                            const manifest: PluginManifest = YAML.parse(yamlContent);

                            // Read package.json to get module name
                            const packageJsonPath = path.join(pkgPath, 'package.json');
                            let moduleName = manifest.module;

                            if (fs.existsSync(packageJsonPath)) {
                                const packageJson = JSON.parse(
                                    await fs.promises.readFile(packageJsonPath, 'utf-8'),
                                );
                                moduleName = packageJson.name;
                            }

                            plugins.push({
                                manifest: {
                                    ...manifest,
                                    module: moduleName,
                                },
                                location: {
                                    type: 'npm',
                                    module: moduleName || manifest.name,
                                },
                            });
                        } catch (error) {
                            console.warn(
                                `Failed to parse plugin.yaml for package ${pkgPath}:`,
                                error,
                            );
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to scan node_modules for plugins:`, error);
        }
    }

    return plugins;
}

// Comprehensive function to scan all project information in one pass
async function scanProjectInfo(
    pagesBasePath: string,
    componentsBasePath: string,
    configBasePath: string,
    projectRootPath: string,
): Promise<ProjectInfo> {
    // Scan basic project info
    const [projectName, components, plugins] = await Promise.all([
        getProjectName(configBasePath),
        scanProjectComponents(componentsBasePath),
        scanPlugins(projectRootPath),
    ]);

    // Scan plugin contracts using new plugin system
    const pluginContracts = await scanPluginContracts(plugins, projectRootPath);

    // Scan pages with full information (basic info + contracts + used components)
    const pages: ProjectPage[] = [];

    await scanPageDirectories(pagesBasePath, async (context) => {
        const { dirPath, pageUrl, pageName, hasPageHtml, hasPageContract, hasPageConfig } = context;
        const pageFilePath = path.join(dirPath, PAGE_FILENAME);
        const pageConfigPath = path.join(dirPath, PAGE_CONFIG_FILENAME);
        const contractPath = path.join(dirPath, PAGE_CONTRACT_FILENAME);

        let usedComponents: {
            appName: string;
            componentName: string;
            key: string;
        }[] = [];
        let contractSchema: ContractSchema | undefined;

        // Parse contract if exists
        if (hasPageContract) {
            try {
                const parsedContract = await parseContractFile(contractPath);
                if (parsedContract) {
                    contractSchema = parsedContract;
                }
            } catch (error) {
                console.warn(`Failed to parse contract file ${contractPath}:`, error);
            }
        }

        // Parse used components - Priority 1: jay-html
        if (hasPageHtml) {
            try {
                const jayHtmlContent = await fs.promises.readFile(pageFilePath, 'utf-8');
                // Use the new plugin-based extraction
                usedComponents = await extractHeadlessComponentsFromJayHtml(
                    jayHtmlContent,
                    path.basename(pageFilePath),
                    path.dirname(pageFilePath),
                    projectRootPath,
                );
            } catch (error) {
                console.warn(`Failed to read page file ${pageFilePath}:`, error);
            }
        }
        // Priority 2: page.conf.yaml
        else if (hasPageConfig) {
            try {
                const configContent = await fs.promises.readFile(pageConfigPath, 'utf-8');
                const pageConfig = YAML.parse(configContent);
                if (pageConfig.used_components && Array.isArray(pageConfig.used_components)) {
                    // Process used components using the documented page.conf.yaml syntax
                    for (const comp of pageConfig.used_components) {
                        // Validate required fields as per page.conf.yaml documentation
                        if (!comp.name || !comp.src || !comp.key) {
                            console.warn(
                                `Invalid component in page.conf.yaml: ${JSON.stringify(comp)}. ` +
                                `Required fields: name (contract), src (plugin), key (unique identifier)`
                            );
                            continue;
                        }

                        const pluginName = comp.src;
                        const contractName = comp.name;
                        const key = comp.key;

                        // Validate that the plugin and contract exist
                        const plugin = plugins.find((p) => p.manifest.name === pluginName);
                        if (plugin) {
                            let contractFound = false;
                            const availableContracts: string[] = [];

                            // Check pages
                            if (plugin.manifest.pages) {
                                availableContracts.push(...plugin.manifest.pages.map(p => p.name));
                                contractFound = plugin.manifest.pages.some(p => p.name === contractName);
                            }

                            // Check components
                            if (plugin.manifest.components) {
                                availableContracts.push(...plugin.manifest.components.map(c => c.name));
                                contractFound = contractFound || plugin.manifest.components.some(c => c.name === contractName);
                            }

                            // Check legacy contracts
                            if (plugin.manifest.contracts) {
                                availableContracts.push(...plugin.manifest.contracts.map(c => c.name));
                                contractFound = contractFound || plugin.manifest.contracts.some(c => c.name === contractName);
                            }

                            if (!contractFound && availableContracts.length > 0) {
                                console.warn(
                                    `Contract "${contractName}" not found in plugin "${pluginName}". ` +
                                    `Available contracts: ${availableContracts.join(', ')}`
                                );
                            } else if (availableContracts.length === 0) {
                                console.warn(
                                    `Plugin "${pluginName}" has no contracts defined.`
                                );
                            }
                        } else {
                            console.warn(
                                `Plugin "${pluginName}" not found.`
                            );
                        }

                        // Add the component (validation warnings above are just warnings)
                        usedComponents.push({
                            appName: pluginName,
                            componentName: contractName,
                            key,
                        });
                    }
                }
            } catch (error) {
                console.warn(`Failed to parse page config ${pageConfigPath}:`, error);
            }
        }

        pages.push({
            name: pageName,
            url: pageUrl,
            filePath: pageFilePath,
            contractSchema,
            usedComponents,
        });
    });

    return {
        name: projectName,
        localPath: projectRootPath,
        pages,
        components,
        plugins,
        pluginContracts,
    };
}

type CreatedJayHtml = {
    jayHtml: string;
    filename: string;
    dirname: string;
    fullPath: string;
};

async function handlePagePublish(
    resolvedConfig: Required<JayConfig>,
    page: PublishPage,
): Promise<[PublishStatus, CreatedJayHtml]> {
    try {
        const pagesBasePath = path.resolve(resolvedConfig.devServer.pagesBase);

        // Convert route to file path
        const routePath = page.route === '/' ? '' : page.route;
        const dirname = path.join(pagesBasePath, routePath);
        const fullPath = path.join(dirname, PAGE_FILENAME);

        // Ensure directory exists
        await fs.promises.mkdir(dirname, { recursive: true });

        // Write the page content
        await fs.promises.writeFile(fullPath, page.jayHtml, 'utf-8');

        let contractPath: string | undefined;

        // Write contract file if provided
        if (page.contract) {
            contractPath = path.join(dirname, `page${JAY_CONTRACT_EXTENSION}`);
            await fs.promises.writeFile(contractPath, page.contract, 'utf-8');
            console.log(`📄 Published page contract: ${contractPath}`);
        }

        const createdJayHtml: CreatedJayHtml = {
            jayHtml: page.jayHtml,
            filename: PAGE_FILENAME,
            dirname,
            fullPath,
        };

        console.log(`📝 Published page: ${fullPath}`);

        return [
            {
                success: true,
                filePath: fullPath,
                contractPath,
            },
            createdJayHtml,
        ];
    } catch (error) {
        console.error(`Failed to publish page ${page.route}:`, error);
        return [
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            undefined,
        ];
    }
}

async function handleComponentPublish(
    resolvedConfig: Required<JayConfig>,
    component: PublishComponent,
): Promise<[PublishStatus, CreatedJayHtml]> {
    try {
        const dirname = path.resolve(resolvedConfig.devServer.componentsBase);
        const filename = `${component.name}${JAY_EXTENSION}`;
        const fullPath = path.join(dirname, filename);

        // Ensure components directory exists
        await fs.promises.mkdir(dirname, { recursive: true });

        // Write the component content
        await fs.promises.writeFile(fullPath, component.jayHtml, 'utf-8');

        let contractPath: string | undefined;

        // Write contract file if provided
        if (component.contract) {
            contractPath = path.join(dirname, `${component.name}${JAY_CONTRACT_EXTENSION}`);
            await fs.promises.writeFile(contractPath, component.contract, 'utf-8');
        }

        const createdJayHtml: CreatedJayHtml = {
            jayHtml: component.jayHtml,
            filename,
            dirname,
            fullPath,
        };

        console.log(`🧩 Published component: ${fullPath}`);

        return [
            {
                success: true,
                filePath: fullPath,
                contractPath,
            },
            createdJayHtml,
        ];
    } catch (error) {
        console.error(`Failed to publish component ${component.name}:`, error);
        return [
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            undefined,
        ];
    }
}

export function createEditorHandlers(
    config: Required<JayConfig>,
    tsConfigPath: string,
    projectRoot: string,
) {
    const onPublish = async (params: PublishMessage): Promise<PublishResponse> => {
        const status: PublishStatus[] = [];
        const createdJayHtmls: CreatedJayHtml[] = [];

        // Handle pages if provided
        if (params.pages) {
            for (const page of params.pages) {
                const [pageStatus, createdJayHtml] = await handlePagePublish(config, page);
                status.push(pageStatus);
                if (pageStatus.success) createdJayHtmls.push(createdJayHtml);
            }
        }

        // Handle components if provided
        if (params.components) {
            for (const component of params.components) {
                const [compStatus, createdJayHtml] = await handleComponentPublish(
                    config,
                    component,
                );
                status.push(compStatus);
                if (compStatus.success) createdJayHtmls.push(createdJayHtml);
            }
        }

        for (const { jayHtml, dirname, filename, fullPath } of createdJayHtmls) {
            const parsedJayHtml = await parseJayFile(
                jayHtml,
                filename,
                dirname,
                { relativePath: tsConfigPath },
                JAY_IMPORT_RESOLVER,
                projectRoot,
            );
            const definitionFile = generateElementDefinitionFile(parsedJayHtml);
            if (definitionFile.validations.length > 0)
                console.log(
                    `failed to generate .d.ts for ${fullPath} with validation errors: ${definitionFile.validations.join('\n')}`,
                );
            else await fs.promises.writeFile(fullPath + '.d.ts', definitionFile.val, 'utf-8');
        }

        return {
            type: 'publish',
            success: status.every((s) => s.success),
            status,
        };
    };

    const onSaveImage = async (params: SaveImageMessage): Promise<SaveImageResponse> => {
        try {
            const imagesDir = path.join(path.resolve(config.devServer.publicFolder), 'images');

            // Ensure images directory exists
            await fs.promises.mkdir(imagesDir, { recursive: true });

            // Use imageId as filename with .png extension
            const filename = `${params.imageId}.png`;
            const imagePath = path.join(imagesDir, filename);

            // Save the image
            await fs.promises.writeFile(imagePath, Buffer.from(params.imageData, 'base64'));

            console.log(`🖼️  Saved image: ${imagePath}`);

            return {
                type: 'saveImage',
                success: true,
                imageUrl: `/images/${filename}`,
            };
        } catch (error) {
            console.error('Failed to save image:', error);
            return {
                type: 'saveImage',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    const onHasImage = async (params: HasImageMessage): Promise<HasImageResponse> => {
        try {
            const filename = `${params.imageId}.png`;
            const imagePath = path.join(
                path.resolve(config.devServer.publicFolder),
                'images',
                filename,
            );

            const exists = fs.existsSync(imagePath);

            return {
                type: 'hasImage',
                success: true,
                exists,
                imageUrl: exists ? `/images/${filename}` : undefined,
            };
        } catch (error) {
            console.error('Failed to check image:', error);
            return {
                type: 'hasImage',
                success: false,
                exists: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    const onGetProjectInfo = async (
        params: GetProjectInfoMessage,
    ): Promise<GetProjectInfoResponse> => {
        try {
            const pagesBasePath = path.resolve(config.devServer.pagesBase);
            const componentsBasePath = path.resolve(config.devServer.componentsBase);
            const configBasePath = path.resolve(config.devServer.configBase);
            const projectRootPath = process.cwd();

            // Scan all project information in one comprehensive pass
            const info = await scanProjectInfo(
                pagesBasePath,
                componentsBasePath,
                configBasePath,
                projectRootPath,
            );

            console.log(`📋 Retrieved project info: ${info.name}`);
            console.log(`   Pages: ${info.pages.length}`);
            console.log(`   Components: ${info.components.length}`);
            console.log(`   Installed Apps: ${info.installedApps.length}`);
            console.log(`   App Contracts: ${Object.keys(info.installedAppContracts).length}`);

            return {
                type: 'getProjectInfo',
                success: true,
                info,
            };
        } catch (error) {
            console.error('Failed to get project info:', error);
            return {
                type: 'getProjectInfo',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                info: {
                    name: 'Error',
                    localPath: process.cwd(),
                    pages: [],
                    components: [],
                    installedApps: [],
                    installedAppContracts: {},
                    plugins: [],
                },
            };
        }
    };

    const onImportDesign = async (params: ImportDesignMessage): Promise<ImportDesignResponse> => {
        try {
            const { vendorId, pageUrl } = params;
            const pagesBasePath = path.resolve(config.devServer.pagesBase);

            // If pageUrl is undefined, return list of all pages with vendor design files
            if (!pageUrl) {
                try {
                    const entries = await fs.promises.readdir(pagesBasePath, {
                        withFileTypes: true,
                    });
                    const pageUrls: string[] = [];

                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            const vendorFile = path.join(
                                pagesBasePath,
                                entry.name,
                                `page.${vendorId}.json`,
                            );
                            try {
                                await fs.promises.access(vendorFile);
                                pageUrls.push(entry.name);
                            } catch {
                                // Skip directories without vendor design files
                            }
                        }
                    }

                    console.log(`📋 Listed ${pageUrls.length} pages with ${vendorId} designs`);

                    return {
                        type: 'importDesign',
                        success: true,
                        data: { pageUrls },
                    };
                } catch (error) {
                    console.error('Failed to list pages:', error);
                    return {
                        type: 'importDesign',
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to list pages',
                    };
                }
            }

            // For specific page, verify it exists and return its URL
            const targetDir = path.join(pagesBasePath, pageUrl);
            const vendorFile = path.join(targetDir, `page.${vendorId}.json`);

            // Check if file exists
            try {
                await fs.promises.access(vendorFile);
            } catch {
                return {
                    type: 'importDesign',
                    success: false,
                    error: 'Design file not found',
                };
            }

            console.log(`📥 Verified design exists for ${pageUrl} from ${vendorId}`);

            return {
                type: 'importDesign',
                success: true,
                data: { pageUrls: [pageUrl] },
            };
        } catch (error) {
            console.error('Failed to import design:', error);
            return {
                type: 'importDesign',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    const onExportDesign = async (params: ExportDesignMessage): Promise<ExportDesignResponse> => {
        try {
            const { vendorId, pageUrl, data } = params;

            const pagesBasePath = path.resolve(config.devServer.pagesBase);
            const componentsBasePath = path.resolve(config.devServer.componentsBase);
            const configBasePath = path.resolve(config.devServer.configBase);
            const projectRootPath = process.cwd();
            const cleanUrl = pageUrl.replace(/^\//, '').replace(/\/$/, '');
            const targetDir = path.join(pagesBasePath, cleanUrl);

            // Ensure directory exists
            await fs.promises.mkdir(targetDir, { recursive: true });

            // 1. Get Adapter
            let adapter;
            try {
                adapter = designAdapterRegistry.get(vendorId);
            } catch (e) {
                return {
                    type: 'exportDesign',
                    success: false,
                    error: (e as Error).message,
                };
            }

            // 2. Validate (Optional)
            if (adapter.validate && !adapter.validate(data)) {
                return {
                    type: 'exportDesign',
                    success: false,
                    error: 'Invalid data format',
                };
            }

            // 3. Get contract information for this page and convert to YAML
            const projectInfo = await scanProjectInfo(
                pagesBasePath,
                componentsBasePath,
                configBasePath,
                projectRootPath,
            );

            const pageContract = projectInfo.pages.find((p) => p.url === pageUrl);

            // Import here to avoid circular dependency
            const { convertContractToScript } = await import('@jay-framework/dev-server');

            // Always provide contractScript (Jay framework requires jay-data script)
            const contractScript = convertContractToScript(pageContract?.contractSchema);

            const contractContext = {
                pageUrl,
                contractScript,
            };

            // 4. Save Source of Truth (vendor JSON)
            const vendorFile = path.join(targetDir, `page.${vendorId}.json`);
            await fs.promises.writeFile(vendorFile, JSON.stringify(data, null, 2));

            // 5. Convert to jay-html with contract context
            const jayHtml = await adapter.convert(data, contractContext);

            // 6. Save Generated Code
            const jayHtmlFile = path.join(targetDir, 'page.jay-html');
            await fs.promises.writeFile(jayHtmlFile, jayHtml);

            console.log(`📤 Exported design for ${pageUrl} from ${vendorId}`);

            return {
                type: 'exportDesign',
                success: true,
                path: vendorFile,
            };
        } catch (error) {
            console.error('Failed to export design:', error);
            return {
                type: 'exportDesign',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    return {
        onPublish,
        onSaveImage,
        onHasImage,
        onGetProjectInfo,
        onExportDesign,
        onImportDesign,
    };
}
