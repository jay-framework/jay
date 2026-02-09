import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
import { parse } from 'node-html-parser';
import { createRequire } from 'module';
import { getLogger } from '@jay-framework/logger';
import type {
    PublishMessage,
    PublishComponent,
    PublishPage,
    PublishResponse,
    PublishStatus,
    SaveImageMessage,
    HasImageMessage,
    GetProjectInfoMessage,
    ExportMessage,
    ImportMessage,
    SaveImageResponse,
    HasImageResponse,
    GetProjectInfoResponse,
    ExportResponse,
    ImportResponse,
    ProjectInfo,
    ProjectPage,
    ProjectComponent,
    Contract,
    Plugin,
} from '@jay-framework/editor-protocol';
import type { JayConfig } from './config';
import { getVendor, hasVendor } from './vendors';
import { buildJayHtmlFromVendorResult } from './vendors/jay-html-builder';
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
    LOCAL_PLUGIN_PATH,
    resolvePluginManifest,
} from '@jay-framework/compiler-shared';

const PAGE_FILENAME = `page${JAY_EXTENSION}`;
const PAGE_CONTRACT_FILENAME = `page${JAY_CONTRACT_EXTENSION}`;
const PAGE_CONFIG_FILENAME = 'page.conf.yaml';

/**
 * Converts a page URL/route to a directory path within the pages base directory.
 * The root path '/' is converted to an empty string.
 * Dynamic route parameters are converted from URL format to filesystem format:
 * - URL format: ':paramName' → Filesystem format: '[paramName]'
 *
 * @param pageUrl - The page URL or route (e.g., '/', '/about', '/products/:id')
 * @param pagesBasePath - The base path for pages
 * @returns The full directory path for the page
 *
 * @example
 * pageUrlToDirectoryPath('/', '/src/pages') → '/src/pages'
 * pageUrlToDirectoryPath('/about', '/src/pages') → '/src/pages/about'
 * pageUrlToDirectoryPath('/products/:id', '/src/pages') → '/src/pages/products/[id]'
 */
function pageUrlToDirectoryPath(pageUrl: string, pagesBasePath: string): string {
    const routePath = pageUrl === '/' ? '' : pageUrl;

    // Convert dynamic route parameters from URL format (:param) to filesystem format ([param])
    const fsPath = routePath.replace(/:([^/]+)/g, '[$1]');

    return path.join(pagesBasePath, fsPath);
}

// Helper function to convert JayType to string representation for protocol
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

// Helper function to convert compiler ContractTag to protocol ContractTag
function convertContractTagToProtocol(tag: ContractTag): Contract['tags'][0] {
    // Ensure tag.type is always treated as an array
    const typeArray = Array.isArray(tag.type) ? tag.type : [tag.type];
    // Convert enum array to string array
    const typeStrings = typeArray.map((t) => ContractTagType[t]);

    return {
        tag: tag.tag,
        type: typeStrings.length === 1 ? typeStrings[0] : typeStrings,
        dataType: tag.dataType ? jayTypeToString(tag.dataType) : undefined,
        elementType: tag.elementType ? tag.elementType.join(' | ') : undefined,
        required: tag.required,
        repeated: tag.repeated,
        trackBy: tag.trackBy,
        async: tag.async,
        phase: tag.phase,
        link: tag.link,
        tags: tag.tags ? tag.tags.map(convertContractTagToProtocol) : undefined,
    };
}

// Helper function to convert compiler Contract to protocol Contract
function convertContractToProtocol(contract: { name: string; tags: ContractTag[] }): Contract {
    return {
        name: contract.name,
        tags: contract.tags.map(convertContractTagToProtocol),
    };
}

// Helper function to check if a directory is a page
// A directory is a page if it has .jay-html OR .jay-contract OR page.conf.yaml
async function isPageDirectory(dirPath: string): Promise<{
    isPage: boolean;
    hasPageHtml: boolean;
    hasPageContract: boolean;
    hasPageConfig: boolean;
}> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const hasPageHtml = entries.some((e) => e.name === PAGE_FILENAME);
    const hasPageContract = entries.some((e) => e.name === PAGE_CONTRACT_FILENAME);
    const hasPageConfig = entries.some((e) => e.name === PAGE_CONFIG_FILENAME);
    const isPage = hasPageHtml || hasPageContract || hasPageConfig;

    return { isPage, hasPageHtml, hasPageContract, hasPageConfig };
}

type PageContext = {
    dirPath: string;
    pageUrl: string;
    pageName: string;
    hasPageHtml: boolean;
    hasPageContract: boolean;
    hasPageConfig: boolean;
};

// Generic page directory scanner that accepts a callback for processing each page
async function scanPageDirectories(
    pagesBasePath: string,
    onPageFound: (context: PageContext) => Promise<void>,
): Promise<void> {
    async function scanDirectory(dirPath: string, urlPath: string = '') {
        try {
            // Check if this directory is a page (has .jay-html OR .jay-contract OR page.conf.yaml)
            const { isPage, hasPageHtml, hasPageContract, hasPageConfig } =
                await isPageDirectory(dirPath);

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
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
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
            getLogger().warn(`Failed to scan directory ${dirPath}: ${error}`);
        }
    }

    await scanDirectory(pagesBasePath);
}

// Helper function to recursively resolve linked sub-contracts
// Synchronous to match JAY_IMPORT_RESOLVER and support use in scanPlugins
function expandContractTags(tags: ContractTag[], baseDir: string): ContractTag[] {
    const resolvedTags: ContractTag[] = [];

    for (const tag of tags) {
        if (tag.link) {
            // This is a linked sub-contract - load it from the file
            try {
                const linkWithExtension = tag.link.endsWith(JAY_CONTRACT_EXTENSION)
                    ? tag.link
                    : tag.link + JAY_CONTRACT_EXTENSION;

                // Use resolver to handle both relative and package paths
                const linkedPath = JAY_IMPORT_RESOLVER.resolveLink(baseDir, linkWithExtension);

                // Load the raw contract
                const loadResult = JAY_IMPORT_RESOLVER.loadContract(linkedPath);

                if (loadResult.val) {
                    // Recursively expand its tags
                    const expandedSubTags = expandContractTags(
                        loadResult.val.tags,
                        path.dirname(linkedPath),
                    );

                    // Create a sub-contract tag with the expanded tags
                    const resolvedTag: ContractTag = {
                        tag: tag.tag,
                        type: tag.type, // Keep the original enum type
                        tags: expandedSubTags,
                        required: tag.required,
                        repeated: tag.repeated,
                        trackBy: tag.trackBy,
                        async: tag.async,
                        phase: tag.phase,
                        link: tag.link,
                    };

                    resolvedTags.push(resolvedTag);
                } else {
                    getLogger().warn(`Failed to load linked contract: ${tag.link} from ${baseDir}`);
                    resolvedTags.push(tag);
                }
            } catch (error) {
                getLogger().warn(`Error resolving linked contract ${tag.link}: ${error}`);
                resolvedTags.push(tag);
            }
        } else if (tag.tags) {
            // This is an inline sub-contract - recursively resolve its tags
            const resolvedSubTags = expandContractTags(tag.tags, baseDir);
            const resolvedTag: ContractTag = {
                ...tag,
                tags: resolvedSubTags,
            };
            resolvedTags.push(resolvedTag);
        } else {
            // Regular tag (data, interactive, variant) - include as-is
            resolvedTags.push(tag);
        }
    }

    return resolvedTags;
}

// Helper function to parse a contract file and return Contract with expanded tags
// Replaces parseContractFile and is used by scanPlugins
function loadAndExpandContract(contractFilePath: string): Contract | null {
    try {
        const loadResult = JAY_IMPORT_RESOLVER.loadContract(contractFilePath);

        if (loadResult.validations.length > 0) {
            getLogger().warn(
                `Contract validation errors in ${contractFilePath}:`,
                loadResult.validations,
            );
        }

        if (loadResult.val) {
            // Resolve any linked sub-contracts
            const resolvedTags = expandContractTags(
                loadResult.val.tags,
                path.dirname(contractFilePath),
            );

            return convertContractToProtocol({
                name: loadResult.val.name,
                tags: resolvedTags,
            });
        }
    } catch (error) {
        getLogger().warn(`Failed to parse contract file ${contractFilePath}: ${error}`);
    }
    return null;
}

// Helper function to build full page contracts (combines page contracts with installed app components)
// Helper function to extract headless components from parsed jay-html and resolve to app/component names
async function extractHeadlessComponentsFromJayHtml(
    jayHtmlContent: string,
    pageFilePath: string,
    projectRootPath: string,
): Promise<
    {
        appName: string;
        componentName: string;
        key: string;
    }[]
> {
    try {
        // Use the compiler's parseJayFile to extract headless imports
        const parsedJayHtml = await parseJayFile(
            jayHtmlContent,
            path.basename(pageFilePath),
            path.dirname(pageFilePath),
            { relativePath: '' }, // We don't need TypeScript config for headless extraction
            JAY_IMPORT_RESOLVER,
            projectRootPath,
        );

        if (parsedJayHtml.validations.length > 0) {
            getLogger().warn(
                `Jay-HTML parsing warnings for ${pageFilePath}:${parsedJayHtml.validations.join(', ')}`
            );
        }

        if (!parsedJayHtml.val) {
            getLogger().warn(`Failed to parse jay-html file: ${pageFilePath}`);
            return [];
        }

        // Extract headless components from the parsed jay-html
        const resolvedComponents: {
            appName: string;
            componentName: string;
            key: string;
        }[] = [];

        for (const headlessImport of parsedJayHtml.val.headlessImports) {
            // The headless import contains the resolved plugin and contract information
            // The codeLink should contain the plugin module information
            if (headlessImport.codeLink) {
                // Extract plugin name from the codeLink module
                // For NPM packages, this will be the package name (e.g., 'test-app')
                // For local plugins, this will be a path to the plugin
                let pluginName = headlessImport.codeLink.module;

                // If it's a path to node_modules, extract just the package name
                const nodeModulesMatch = pluginName.match(/node_modules\/([^/]+)/);
                if (nodeModulesMatch) {
                    pluginName = nodeModulesMatch[1];
                }

                // For the component name, we use the contract name from the loaded contract
                const componentName = headlessImport.contract?.name || 'unknown';

                resolvedComponents.push({
                    appName: pluginName,
                    componentName: componentName,
                    key: headlessImport.key,
                });
            }
        }

        return resolvedComponents;
    } catch (error) {
        getLogger().warn(`Failed to parse jay-html content for ${pageFilePath}:${error}`);
        return [];
    }
}

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
        getLogger().warn(`Failed to scan components directory ${componentsBasePath}: ${error}`);
    }

    return components;
}

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
        getLogger().warn(`Failed to read project config ${projectConfigPath}: ${error}`);
    }

    return 'Unnamed Project';
}

/**
 * Scans for local plugins in src/plugins/ and extracts plugin names that have plugin.yaml
 */
async function scanLocalPluginNames(projectRoot: string): Promise<string[]> {
    const plugins: string[] = [];
    const localPluginsDir = path.join(projectRoot, LOCAL_PLUGIN_PATH);

    if (!fs.existsSync(localPluginsDir)) {
        return plugins;
    }

    try {
        const entries = await fs.promises.readdir(localPluginsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const pluginDir = path.join(localPluginsDir, entry.name);
                const pluginYamlPath = path.join(pluginDir, 'plugin.yaml');

                if (fs.existsSync(pluginYamlPath)) {
                    plugins.push(entry.name);
                }
            }
        }
    } catch (error) {
        getLogger().warn(`Failed to scan local plugins directory ${localPluginsDir}:`, error);
    }

    return plugins;
}

/**
 * Finds all plugin names installed as dependencies in package.json
 * Checks both regular node_modules and workspace node_modules
 * @param projectRootPath - Project root path
 * @returns Array of plugin names that have plugin.yaml
 */
async function findPluginNamesFromPackageJson(projectRootPath: string): Promise<string[]> {
    const pluginNames: string[] = [];

    try {
        // Read package.json
        const packageJsonPath = path.join(projectRootPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            getLogger().warn('package.json not found');
            return pluginNames;
        }

        const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        // Separate workspace dependencies from regular ones
        const workspaceDependencies = new Set<string>();
        const regularDependencies = new Set<string>();

        for (const [depName, version] of Object.entries({
            ...packageJson.dependencies,
        })) {
            if (typeof version === 'string' && version.startsWith('workspace:')) {
                workspaceDependencies.add(depName);
            } else {
                regularDependencies.add(depName);
            }
        }

        // Check regular dependencies in node_modules
        const nodeModulesPath = path.join(projectRootPath, 'node_modules');
        for (const depName of regularDependencies) {
            if (await checkPackageForPlugin(nodeModulesPath, depName)) {
                pluginNames.push(depName);
            }
        }

        // Check workspace dependencies
        if (workspaceDependencies.size > 0) {
            const workspaceNodeModules = await findWorkspaceNodeModulesPath(
                projectRootPath,
                Array.from(workspaceDependencies),
            );
            if (workspaceNodeModules) {
                for (const depName of workspaceDependencies) {
                    if (await checkPackageForPlugin(workspaceNodeModules, depName)) {
                        pluginNames.push(depName);
                    }
                }
            }
        }
    } catch (error) {
        getLogger().error('Error finding plugins from package.json:', error);
    }

    return pluginNames;
}

/**
 * Checks if a package in node_modules has a plugin.yaml file
 * @param nodeModulesDir - Path to node_modules directory
 * @param packageName - Name of the package to check
 * @returns true if the package has plugin.yaml
 */
async function checkPackageForPlugin(
    nodeModulesDir: string,
    packageName: string,
): Promise<boolean> {
    try {
        const packageDir = path.join(nodeModulesDir, packageName);
        const pluginYamlPath = path.join(packageDir, 'plugin.yaml');

        return fs.existsSync(pluginYamlPath);
    } catch (error) {
        return false;
    }
}

/**
 * Finds the workspace node_modules directory that contains the workspace dependencies
 * @param startPath - Starting path to search from
 * @param workspaceDeps - List of workspace dependency names
 * @returns Path to workspace node_modules or null if not found
 */
async function findWorkspaceNodeModulesPath(
    startPath: string,
    workspaceDeps: string[],
): Promise<string | null> {
    let currentPath = startPath;

    // Walk up the directory tree looking for a node_modules that contains the workspace deps
    while (currentPath !== path.dirname(currentPath)) {
        // Stop at filesystem root
        const nodeModulesPath = path.join(currentPath, 'node_modules');

        if (fs.existsSync(nodeModulesPath)) {
            // Check if this node_modules contains any of our workspace dependencies
            for (const depName of workspaceDeps) {
                const depPath = path.join(nodeModulesPath, depName);
                if (fs.existsSync(depPath)) {
                    return nodeModulesPath;
                }
            }
        }

        currentPath = path.dirname(currentPath);
    }

    return null;
}

/**
 * Scans for Jay Stack plugins in both src/plugins/ (local) and node_modules/ (npm packages) and package.json (workspace dependencies)
 */
async function scanPlugins(projectRootPath: string): Promise<Plugin[]> {
    const plugins: Plugin[] = [];

    try {
        // Get all plugin names from different sources
        const [localPluginNames, dependencyPluginNames] = await Promise.all([
            scanLocalPluginNames(projectRootPath),
            findPluginNamesFromPackageJson(projectRootPath),
        ]);

        // Combine and deduplicate plugin names
        const allPluginNames = [...new Set([...localPluginNames, ...dependencyPluginNames])];

        getLogger().log(`Found ${allPluginNames.length} plugins: ${allPluginNames.join(', ')}`);

        // For now, return basic plugin structure with names
        // This can be expanded later to load full plugin manifests and contracts
        for (const pluginName of allPluginNames) {
            const manifest = resolvePluginManifest(projectRootPath, pluginName);
            if (manifest.validations.length > 0) {
                getLogger().warn(
                    `Failed to resolve plugin manifest for ${pluginName}:${manifest.validations.join(', ')}`
                );
                continue;
            }
            if (!manifest.val) {
                getLogger().warn(
                    `Failed to resolve plugin manifest for ${pluginName}:${manifest.validations.join(', ')}`
                );
                continue;
            }
            const contracts = manifest.val.contracts;
            plugins.push({
                name: pluginName,
                contracts: contracts.map((contract) => {
                    const resolveResult = JAY_IMPORT_RESOLVER.resolvePluginComponent(
                        pluginName,
                        contract.name,
                        projectRootPath,
                    );
                    if (resolveResult.validations.length > 0) {
                        getLogger().warn(
                            `Failed to resolve plugin component for ${pluginName}:${contract.name}:${resolveResult.validations.join(', ')}`
                        );
                        return null;
                    }
                    if (!resolveResult.val) {
                        getLogger().warn(
                            `Failed to resolve plugin component for ${pluginName}:${contract.name}:${resolveResult.validations.join(', ')}`
                        );
                        return null;
                    }

                    const expandedContract = loadAndExpandContract(resolveResult.val.contractPath);
                    if (!expandedContract) {
                        return null;
                    }
                    return expandedContract;
                }),
            });
        }
    } catch (error) {
        getLogger().error(`Error scanning plugins: ${error}`);
    }

    return plugins;
}

async function loadProjectPage(pageContext: PageContext, plugins: Plugin[]): Promise<ProjectPage> {
    const { dirPath, pageUrl, pageName, hasPageHtml, hasPageContract, hasPageConfig } = pageContext;
    const pageFilePath = path.join(dirPath, PAGE_FILENAME);
    const pageConfigPath = path.join(dirPath, PAGE_CONFIG_FILENAME);
    const contractPath = path.join(dirPath, PAGE_CONTRACT_FILENAME);
    const projectRootPath = process.cwd();

    let usedComponents: {
        appName: string;
        componentName: string;
        key: string;
    }[] = [];
    let contract: Contract | undefined;

    // Parse contract if exists
    if (hasPageContract) {
        const parsedContract = loadAndExpandContract(contractPath);
        if (parsedContract) {
            contract = parsedContract;
        }
    }

    // Parse used components - Priority 1: jay-html
    if (hasPageHtml) {
        try {
            const jayHtmlContent = await fs.promises.readFile(pageFilePath, 'utf-8');
            usedComponents = await extractHeadlessComponentsFromJayHtml(
                jayHtmlContent,
                pageFilePath,
                projectRootPath,
            );
        } catch (error) {
            getLogger().warn(`Failed to read page file ${pageFilePath}:${error}`);
        }
    }
    // Priority 2: page.conf.yaml
    else if (hasPageConfig) {
        try {
            const configContent = await fs.promises.readFile(pageConfigPath, 'utf-8');
            const pageConfig = YAML.parse(configContent);
            if (pageConfig.used_components && Array.isArray(pageConfig.used_components)) {
                // Resolve headless components using plugin/contract syntax
                for (const comp of pageConfig.used_components) {
                    const key = comp.key || '';

                    // Only support plugin + contract syntax for headless components
                    if (comp.plugin && comp.contract) {
                        // For plugin-based references, we look up the plugin in the plugins array
                        const plugin = plugins.find((p) => p.name === comp.plugin);
                        if (plugin && plugin.contracts) {
                            const contract = plugin.contracts.find((c) => c.name === comp.contract);
                            if (contract) {
                                // Use plugin name as appName and contract name as componentName
                                usedComponents.push({
                                    appName: comp.plugin,
                                    componentName: comp.contract,
                                    key,
                                });
                                continue;
                            }
                        }
                        // If not resolved, still add it (may be resolved later)
                        usedComponents.push({
                            appName: comp.plugin,
                            componentName: comp.contract,
                            key,
                        });
                    } else {
                        getLogger().warn(
                            `Invalid component definition in ${pageConfigPath}: Only plugin/contract syntax is supported for headless components. Found:${JSON.stringify(comp)}`
                        );
                    }
                }
            }
        } catch (error) {
            getLogger().warn(`Failed to parse page config ${pageConfigPath}:${error}`);
        }
    }

    return {
        name: pageName,
        url: pageUrl,
        filePath: pageFilePath,
        contract,
        usedComponents,
    };
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

    // Scan pages with full information (basic info + contracts + used components)
    const pages: ProjectPage[] = [];

    await scanPageDirectories(pagesBasePath, async (context) => {
        const page = await loadProjectPage(context, plugins);
        pages.push(page);
    });

    return {
        name: projectName,
        localPath: projectRootPath,
        pages,
        components,
        plugins,
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
        const dirname = pageUrlToDirectoryPath(page.route, pagesBasePath);
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
            getLogger().info(`📄 Published page contract: ${contractPath}`);
        }

        const createdJayHtml: CreatedJayHtml = {
            jayHtml: page.jayHtml,
            filename: PAGE_FILENAME,
            dirname,
            fullPath,
        };

        getLogger().info(`📝 Published page: ${fullPath}`);

        return [
            {
                success: true,
                filePath: fullPath,
                contractPath,
            },
            createdJayHtml,
        ];
    } catch (error) {
        getLogger().error(`Failed to publish page ${page.route}: ${error}`);
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

        getLogger().info(`🧩 Published component: ${fullPath}`);

        return [
            {
                success: true,
                filePath: fullPath,
                contractPath,
            },
            createdJayHtml,
        ];
    } catch (error) {
        getLogger().error(`Failed to publish component ${component.name}: ${error}`);
        return [
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            undefined,
        ];
    }
}

async function loadPageContracts(
    dirPath: string,
    pageUrl: string,
    projectRootPath: string,
): Promise<{ projectPage: ProjectPage; plugins: Plugin[] }> {
    //load page's info - with it's contract and its used components contracts
    const { hasPageHtml, hasPageContract, hasPageConfig } = await isPageDirectory(dirPath);
    const plugins = await scanPlugins(projectRootPath);
    const pageInfo = await loadProjectPage(
        {
            dirPath,
            pageUrl,
            pageName: path.basename(dirPath),
            hasPageHtml,
            hasPageContract,
            hasPageConfig,
        },
        plugins,
    );

    return { projectPage: pageInfo, plugins };
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
                getLogger().warn(
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

            getLogger().info(`🖼️  Saved image: ${imagePath}`);

            return {
                type: 'saveImage',
                success: true,
                imageUrl: `/images/${filename}`,
            };
        } catch (error) {
            getLogger().error(`Failed to save image: ${error}`);
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
            getLogger().error(`Failed to check image: ${error}`);
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

            // Scan all project information in one comprehensive pass
            const info = await scanProjectInfo(
                pagesBasePath,
                componentsBasePath,
                configBasePath,
                projectRoot,
            );

            getLogger().log(`📋 Retrieved project info: ${info.name}`);
            getLogger().log(`   Pages: ${info.pages.length}`);
            getLogger().log(`   Components: ${info.components.length}`);
            getLogger().log(`   plugins: ${info.plugins.length}`);

            return {
                type: 'getProjectInfo',
                success: true,
                info,
            };
        } catch (error) {
            getLogger().error(`Failed to get project info: ${error}`);
            return {
                type: 'getProjectInfo',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                info: {
                    name: 'Error',
                    localPath: process.cwd(),
                    pages: [],
                    components: [],
                    plugins: [],
                },
            };
        }
    };

    const onExport = async <TVendorDoc>(
        params: ExportMessage<TVendorDoc>,
    ): Promise<ExportResponse> => {
        try {
            const pagesBasePath = path.resolve(config.devServer.pagesBase);
            const { vendorId, pageUrl, vendorDoc } = params;

            // Convert route to file path
            const dirname = pageUrlToDirectoryPath(pageUrl, pagesBasePath);
            const vendorFilename = `page.${vendorId}.json`;
            const vendorFilePath = path.join(dirname, vendorFilename);

            // Ensure directory exists
            await fs.promises.mkdir(dirname, { recursive: true });

            // Write the vendor document as JSON
            await fs.promises.writeFile(
                vendorFilePath,
                JSON.stringify(vendorDoc, null, 2),
                'utf-8',
            );

            getLogger().log(`📦 Exported ${vendorId} document to: ${vendorFilePath}`);

            // Check if a vendor exists for this vendor ID
            if (hasVendor(vendorId)) {
                getLogger().log(`🔄 Converting ${vendorId} document to Jay HTML...`);
                const vendor = getVendor(vendorId)!;

                try {
                    //load page's info - with it's contract and its used components contracts
                    const { projectPage, plugins } = await loadPageContracts(
                        dirname,
                        pageUrl,
                        projectRoot,
                    );

                    // Run the vendor conversion to get body HTML and metadata
                    const conversionResult = await vendor.convertToBodyHtml(
                        vendorDoc,
                        pageUrl,
                        projectPage,
                        plugins,
                    );

                    // Build the full Jay HTML document with headless components from page.conf.yaml
                    const fullJayHtml = await buildJayHtmlFromVendorResult(
                        conversionResult,
                        dirname,
                        path.basename(dirname),
                    );

                    // Write Jay HTML file
                    const jayHtmlPath = path.join(dirname, 'page.jay-html');
                    await fs.promises.writeFile(jayHtmlPath, fullJayHtml, 'utf-8');

                    getLogger().log(`✅ Successfully converted to Jay HTML: ${jayHtmlPath}`);

                    return {
                        type: 'export',
                        success: true,
                        vendorSourcePath: vendorFilePath,
                        jayHtmlPath,
                    };
                } catch (conversionError) {
                    getLogger().error(`❌ Vendor conversion threw an error:${conversionError}`);
                    return {
                        type: 'export',
                        success: false,
                        vendorSourcePath: vendorFilePath,
                        error:
                            conversionError instanceof Error
                                ? conversionError.message
                                : 'Unknown conversion error',
                    };
                }
            } else {
                getLogger().log(`ℹ️  No vendor found for '${vendorId}'. Skipping conversion.`);
            }

            return {
                type: 'export',
                success: true,
                vendorSourcePath: vendorFilePath,
            };
        } catch (error) {
            getLogger().error(`Failed to export vendor document:${error}`);
            return {
                type: 'export',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    const onImport = async <TVendorDoc>(
        params: ImportMessage<TVendorDoc>,
    ): Promise<ImportResponse<TVendorDoc>> => {
        try {
            const pagesBasePath = path.resolve(config.devServer.pagesBase);
            const { vendorId, pageUrl } = params;

            // Convert route to file path
            const dirname = pageUrlToDirectoryPath(pageUrl, pagesBasePath);
            const vendorFilename = `page.${vendorId}.json`;
            const vendorFilePath = path.join(dirname, vendorFilename);

            // Check if the file exists
            if (!fs.existsSync(vendorFilePath)) {
                return {
                    type: 'import',
                    success: false,
                    error: `No ${vendorId} document found at ${pageUrl}. File not found: ${vendorFilePath}`,
                };
            }

            // Read and parse the vendor document
            const fileContent = await fs.promises.readFile(vendorFilePath, 'utf-8');
            const vendorDoc = JSON.parse(fileContent) as TVendorDoc;

            getLogger().log(`📥 Imported ${vendorId} document from: ${vendorFilePath}`);

            return {
                type: 'import',
                success: true,
                vendorDoc,
            };
        } catch (error) {
            getLogger().error(`Failed to import vendor document:${error}`);
            return {
                type: 'import',
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
        onExport,
        onImport,
    };
}
