import path from 'path';
import fs from 'fs';
import { getLogger } from '@jay-framework/logger';
import YAML from 'yaml';
import type {
    PublishMessage,
    PublishComponent,
    PublishPage,
    PublishResponse,
    PublishStatus,
    SaveImageMessage,
    HasImageMessage,
    GetImageDataMessage,
    GetProjectInfoMessage,
    ExportMessage,
    ImportMessage,
    MergePreviewRequest,
    MergeApplyRequest,
    SaveImageResponse,
    HasImageResponse,
    GetImageDataResponse,
    GetProjectInfoResponse,
    ExportResponse,
    ImportResponse,
    MergePreviewResponse,
    MergeApplyResponse,
    ProjectInfo,
    ProjectPage,
    ProjectComponent,
    Contract,
    Plugin,
    FigmaVendorDocument,
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
            getLogger().warn(`Failed to scan directory ${dirPath}:`, error);
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
                getLogger().warn(`Error resolving linked contract ${tag.link}:`, error);
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
        getLogger().warn(`Failed to parse contract file ${contractFilePath}:`, error);
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
                `Jay-HTML parsing warnings for ${pageFilePath}:`,
                parsedJayHtml.validations,
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
                // For local plugins, this will be a relative path (e.g., '../../plugins/product-data/product-data.ts')
                let pluginName = headlessImport.codeLink.module;

                // If it's a path to node_modules, extract just the package name
                const nodeModulesMatch = pluginName.match(/node_modules\/([^/]+)/);
                if (nodeModulesMatch) {
                    pluginName = nodeModulesMatch[1];
                }

                // For local plugins, extract the plugin directory name from the path
                // Local plugin paths look like: ../../plugins/{pluginName}/{file}.ts
                if (!nodeModulesMatch) {
                    const localPluginMatch = pluginName.match(/(?:^|\/)plugins\/([^/]+)/);
                    if (localPluginMatch) {
                        pluginName = localPluginMatch[1];
                    }
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
        getLogger().warn(`Failed to parse jay-html content for ${pageFilePath}:`, error);
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
        getLogger().warn(`Failed to scan components directory ${componentsBasePath}:`, error);
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
        getLogger().warn(`Failed to read project config ${projectConfigPath}:`, error);
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
                if (entry.name.startsWith('@')) {
                    const scopeDir = path.join(localPluginsDir, entry.name);
                    const scopeEntries = await fs.promises.readdir(scopeDir, {
                        withFileTypes: true,
                    });
                    for (const scopeEntry of scopeEntries) {
                        if (scopeEntry.isDirectory()) {
                            const pluginDir = path.join(scopeDir, scopeEntry.name);
                            const pluginYamlPath = path.join(pluginDir, 'plugin.yaml');
                            if (fs.existsSync(pluginYamlPath)) {
                                plugins.push(`${entry.name}/${scopeEntry.name}`);
                            }
                        }
                    }
                } else {
                    const pluginDir = path.join(localPluginsDir, entry.name);
                    const pluginYamlPath = path.join(pluginDir, 'plugin.yaml');
                    if (fs.existsSync(pluginYamlPath)) {
                        plugins.push(entry.name);
                    }
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

        getLogger().info(`Found ${allPluginNames.length} plugins: ${allPluginNames.join(', ')}`);

        // For now, return basic plugin structure with names
        // This can be expanded later to load full plugin manifests and contracts
        for (const pluginName of allPluginNames) {
            const manifest = resolvePluginManifest(projectRootPath, pluginName);
            if (manifest.validations.length > 0) {
                getLogger().warn(
                    `Failed to resolve plugin manifest for ${pluginName}:`,
                    manifest.validations,
                );
                continue;
            }
            if (!manifest.val) {
                getLogger().warn(
                    `Failed to resolve plugin manifest for ${pluginName}:`,
                    manifest.validations,
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
                            `Failed to resolve plugin component for ${pluginName}:${contract.name}:`,
                            resolveResult.validations,
                        );
                        return null;
                    }
                    if (!resolveResult.val) {
                        getLogger().warn(
                            `Failed to resolve plugin component for ${pluginName}:${contract.name}:`,
                            resolveResult.validations,
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
        getLogger().error('Error scanning plugins:', error);
    }

    return plugins;
}

async function loadProjectPage(
    pageContext: PageContext,
    plugins: Plugin[],
    projectRootPath?: string,
): Promise<ProjectPage> {
    const { dirPath, pageUrl, pageName, hasPageHtml, hasPageContract, hasPageConfig } = pageContext;
    const pageFilePath = path.join(dirPath, PAGE_FILENAME);
    const pageConfigPath = path.join(dirPath, PAGE_CONFIG_FILENAME);
    const contractPath = path.join(dirPath, PAGE_CONTRACT_FILENAME);
    if (!projectRootPath) projectRootPath = process.cwd();

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
            getLogger().warn(`Failed to read page file ${pageFilePath}:`, error);
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
                            `Invalid component definition in ${pageConfigPath}: Only plugin/contract syntax is supported for headless components. Found:`,
                            comp,
                        );
                    }
                }
            }
        } catch (error) {
            getLogger().warn(`Failed to parse page config ${pageConfigPath}:`, error);
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
        const page = await loadProjectPage(context, plugins, projectRootPath);
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
        getLogger().error(`Failed to publish page ${page.route}:`, error);
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
        getLogger().error(`Failed to publish component ${component.name}:`, error);
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
        projectRootPath,
    );

    return { projectPage: pageInfo, plugins };
}

export function createEditorHandlers(
    config: Required<JayConfig>,
    tsConfigPath: string,
    projectRoot: string,
    devServerUrl?: string,
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
                getLogger().info(
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
            getLogger().error('Failed to save image:', error);
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
            getLogger().error('Failed to check image:', error);
            return {
                type: 'hasImage',
                success: false,
                exists: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    const onGetImageData = async (params: GetImageDataMessage): Promise<GetImageDataResponse> => {
        try {
            const imagesDir = path.join(path.resolve(config.devServer.publicFolder), 'images');
            const pngPath = path.join(imagesDir, `${params.imageId}.png`);
            const jpgPath = path.join(imagesDir, `${params.imageId}.jpg`);

            let imagePath: string | undefined;
            let mimeType: string | undefined;
            if (fs.existsSync(pngPath)) {
                imagePath = pngPath;
                mimeType = 'image/png';
            } else if (fs.existsSync(jpgPath)) {
                imagePath = jpgPath;
                mimeType = 'image/jpeg';
            }

            if (!imagePath) {
                return {
                    type: 'getImageData',
                    success: false,
                    error: `Image not found: ${params.imageId}`,
                };
            }

            const bytes = await fs.promises.readFile(imagePath);
            const imageData = bytes.toString('base64');

            getLogger().info(`🖼️  Serving image data: ${imagePath} (${bytes.length} bytes)`);

            return {
                type: 'getImageData',
                success: true,
                imageData,
                mimeType,
            };
        } catch (error) {
            getLogger().error('Failed to get image data:', error);
            return {
                type: 'getImageData',
                success: false,
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

            getLogger().info(`📋 Retrieved project info: ${info.name}`);
            getLogger().info(`   Pages: ${info.pages.length}`);
            getLogger().info(`   Components: ${info.components.length}`);
            getLogger().info(`   plugins: ${info.plugins.length}`);

            return {
                type: 'getProjectInfo',
                success: true,
                info,
            };
        } catch (error) {
            getLogger().error('Failed to get project info:', error);
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

            // N6.1: Block export when unresolved action_required conflicts exist
            const pluginData = (vendorDoc as any)?.pluginData;
            if (pluginData) {
                const { parseSyncState: parseSS } = await import('./vendors/figma/types');
                const syncState = parseSS(pluginData['jay-sync-state-v1']);
                if (syncState && syncState.unresolvedConflictCount > 0) {
                    getLogger().warn(
                        `🚫 Export blocked for "${pageUrl}": ${syncState.unresolvedConflictCount} unresolved conflict(s)`,
                    );
                    return {
                        type: 'export',
                        success: false,
                        error: `Export blocked: ${syncState.unresolvedConflictCount} unresolved conflict(s)`,
                        blocked: true,
                        blockedReason: 'Unresolved conflicts',
                        unresolvedConflictCount: syncState.unresolvedConflictCount,
                        actionHint: 'Resolve conflicts before exporting',
                    };
                }
            }

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

            getLogger().info(`📦 Exported ${vendorId} document to: ${vendorFilePath}`);

            // Check if a vendor exists for this vendor ID
            if (hasVendor(vendorId)) {
                getLogger().info(`🔄 Converting ${vendorId} document to Jay HTML...`);
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

                    const fullJayHtml = await buildJayHtmlFromVendorResult(
                        conversionResult,
                        dirname,
                        path.basename(dirname),
                        projectPage.usedComponents,
                    );

                    // Check for disk divergence before writing
                    const jayHtmlPath = path.join(dirname, 'page.jay-html');
                    let diskDiverged: boolean | undefined;
                    const storedHash = (vendorDoc as any)?.pluginData?.[
                        'jay-import-content-hash'
                    ] as string | undefined;

                    if (storedHash && fs.existsSync(jayHtmlPath)) {
                        try {
                            const { hasContentDiverged } = await import(
                                './vendors/figma/content-hash'
                            );
                            const currentContent = await fs.promises.readFile(jayHtmlPath, 'utf-8');
                            diskDiverged = hasContentDiverged(storedHash, currentContent);
                            if (diskDiverged) {
                                getLogger().warn(
                                    `⚠️  jay-html on disk has changed since last import`,
                                );
                            }
                        } catch {
                            // Can't check divergence — proceed without flag
                        }
                    }

                    // Write Jay HTML file
                    await fs.promises.writeFile(jayHtmlPath, fullJayHtml, 'utf-8');

                    // Debug: dump export pipeline artifacts
                    try {
                        const debugDir = path.join(dirname, '_debug');
                        await fs.promises.mkdir(debugDir, { recursive: true });
                        await fs.promises.writeFile(
                            path.join(debugDir, 'export-final-jay-html.html'),
                            fullJayHtml,
                            'utf-8',
                        );
                        await fs.promises.writeFile(
                            path.join(debugDir, 'export-conversion-result.json'),
                            JSON.stringify(
                                {
                                    bodyHtmlLength: conversionResult.bodyHtml.length,
                                    bodyHtmlLineCount: conversionResult.bodyHtml.split('\n').length,
                                    fontFamilies: Array.from(conversionResult.fontFamilies || []),
                                    hasContractData: !!conversionResult.contractData,
                                },
                                null,
                                2,
                            ),
                            'utf-8',
                        );
                        getLogger().info(`[Debug] Export artifacts written to ${debugDir}`);
                    } catch (debugErr) {
                        getLogger().warn('[Debug] Failed to write export debug files:', debugErr);
                    }

                    getLogger().info(`✅ Successfully converted to Jay HTML: ${jayHtmlPath}`);

                    return {
                        type: 'export',
                        success: true,
                        vendorSourcePath: vendorFilePath,
                        jayHtmlPath,
                        diskDiverged,
                    };
                } catch (conversionError) {
                    getLogger().error('❌ Vendor conversion threw an error:', conversionError);
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
                getLogger().info(`ℹ️  No vendor found for '${vendorId}'. Skipping conversion.`);
            }

            return {
                type: 'export',
                success: true,
                vendorSourcePath: vendorFilePath,
            };
        } catch (error) {
            getLogger().error('Failed to export vendor document:', error);
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
            const dirname = pageUrlToDirectoryPath(pageUrl, pagesBasePath);

            // Read page.jay-html
            const jayHtmlPath = path.join(dirname, PAGE_FILENAME);
            if (!fs.existsSync(jayHtmlPath)) {
                return {
                    type: 'import',
                    success: false,
                    error: `IMPORT_FILE_NOT_FOUND: No Jay-HTML file found at ${jayHtmlPath}`,
                };
            }
            const jayHtmlContent = await fs.promises.readFile(jayHtmlPath, 'utf-8');

            // Parse with compiler-jay-html
            const warnings: string[] = [];
            const parsedResult = await parseJayFile(
                jayHtmlContent,
                'page.jay-html',
                dirname,
                { relativePath: tsConfigPath },
                JAY_IMPORT_RESOLVER,
                projectRoot,
            );

            warnings.push(...(parsedResult.validations || []));

            if (!parsedResult.val) {
                return {
                    type: 'import',
                    success: false,
                    error: `IMPORT_PARSE_FAILED: parseJayFile returned validation errors: ${parsedResult.validations.join('; ')}`,
                };
            }

            // Load contracts
            const { projectPage, plugins } = await loadPageContracts(dirname, pageUrl, projectRoot);

            // Run vendor reverse conversion
            if (!hasVendor(vendorId)) {
                return {
                    type: 'import',
                    success: false,
                    error: `No vendor found for '${vendorId}'`,
                };
            }
            const vendor = getVendor(vendorId)!;
            if (!vendor.convertFromJayHtml) {
                return {
                    type: 'import',
                    success: false,
                    error: `Vendor '${vendorId}' does not support Jay-HTML import`,
                };
            }

            const importResult = await vendor.convertFromJayHtml(
                parsedResult.val,
                pageUrl,
                projectPage,
                plugins,
                { devServerUrl, publicFolder: config.devServer.publicFolder },
            );

            getLogger().info(`📥 Imported ${vendorId} document from Jay-HTML: ${jayHtmlPath}`);

            // Debug: dump vendorDoc to file for inspection
            try {
                const debugDir = path.join(dirname, '_debug');
                await fs.promises.mkdir(debugDir, { recursive: true });
                await fs.promises.writeFile(
                    path.join(debugDir, 'import-vendor-doc.json'),
                    JSON.stringify(importResult.vendorDoc, null, 2),
                    'utf-8',
                );
                getLogger().info(
                    `[Debug] Import vendor doc written to ${debugDir}/import-vendor-doc.json`,
                );
            } catch (debugErr) {
                getLogger().warn('[Debug] Failed to write import debug files:', debugErr);
            }

            const { buildBaseline } = await import('./vendors/figma/iterative/merge-applier');
            const importBaseline = buildBaseline(
                importResult.vendorDoc as FigmaVendorDocument,
                pageUrl,
            );

            return {
                type: 'import',
                success: true,
                vendorDoc: importResult.vendorDoc as TVendorDoc,
                source: 'jay-html-reconstructed',
                warnings,
                imageManifest: importResult.imageManifest,
                baseline: importBaseline,
            };
        } catch (error) {
            getLogger().error('Failed to import from Jay-HTML:', error);
            return {
                type: 'import',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    /**
     * Shared helper: builds the incoming vendor doc from jay-html on disk.
     * Reused by onImport, onMergePreview, and onMergeApply.
     */
    async function buildIncomingVendorDoc(vendorId: string, pageUrl: string) {
        const pagesBasePath = path.resolve(config.devServer.pagesBase);
        const dirname = pageUrlToDirectoryPath(pageUrl, pagesBasePath);
        const jayHtmlPath = path.join(dirname, PAGE_FILENAME);

        if (!fs.existsSync(jayHtmlPath)) {
            return { error: `IMPORT_FILE_NOT_FOUND: No Jay-HTML file found at ${jayHtmlPath}` };
        }

        const jayHtmlContent = await fs.promises.readFile(jayHtmlPath, 'utf-8');
        const warnings: string[] = [];
        const parsedResult = await parseJayFile(
            jayHtmlContent,
            'page.jay-html',
            dirname,
            { relativePath: tsConfigPath },
            JAY_IMPORT_RESOLVER,
            projectRoot,
        );
        warnings.push(...(parsedResult.validations || []));

        if (!parsedResult.val) {
            return {
                error: `IMPORT_PARSE_FAILED: parseJayFile returned validation errors: ${parsedResult.validations.join('; ')}`,
            };
        }

        const { projectPage, plugins } = await loadPageContracts(dirname, pageUrl, projectRoot);

        if (!hasVendor(vendorId)) {
            return { error: `No vendor found for '${vendorId}'` };
        }
        const vendor = getVendor(vendorId)!;
        if (!vendor.convertFromJayHtml) {
            return { error: `Vendor '${vendorId}' does not support Jay-HTML import` };
        }

        const importResult = await vendor.convertFromJayHtml(
            parsedResult.val,
            pageUrl,
            projectPage,
            plugins,
            { devServerUrl, publicFolder: config.devServer.publicFolder },
        );

        return {
            vendorDoc: importResult.vendorDoc as FigmaVendorDocument,
            warnings,
            imageManifest: importResult.imageManifest,
        };
    }

    function detectDesignerOverrides(
        unmatchedCurrentKeys: string[],
        baselineIndex: Map<string, Record<string, unknown>>,
        designerDoc: FigmaVendorDocument,
        extractPropertySnapshot: (node: FigmaVendorDocument) => Record<string, unknown>,
    ): Set<string> {
        const overrides = new Set<string>();
        const designerIdx = new Map<string, FigmaVendorDocument>();
        (function walk(node: FigmaVendorDocument) {
            designerIdx.set(node.id, node);
            if (node.children) for (const c of node.children) walk(c);
        })(designerDoc);

        for (const nodeKey of unmatchedCurrentKeys) {
            const baselineProps = baselineIndex.get(nodeKey);
            if (!baselineProps) continue;
            const designerNode = designerIdx.get(nodeKey);
            if (!designerNode) continue;
            const designerProps = extractPropertySnapshot(designerNode);
            for (const key of Object.keys(designerProps)) {
                if (JSON.stringify(designerProps[key]) !== JSON.stringify(baselineProps[key])) {
                    overrides.add(nodeKey);
                    break;
                }
            }
        }
        return overrides;
    }

    const onMergePreview = async <TVendorDoc>(
        params: MergePreviewRequest<TVendorDoc>,
    ): Promise<MergePreviewResponse> => {
        try {
            const { vendorId, pageUrl, existingSectionData } = params;

            if (!existingSectionData) {
                return {
                    type: 'mergePreview',
                    success: false,
                    error: 'No existing section data provided — use standard import for fresh imports',
                };
            }

            const buildResult = await buildIncomingVendorDoc(vendorId, pageUrl);
            if (buildResult.error) {
                return { type: 'mergePreview', success: false, error: buildResult.error };
            }

            const {
                flattenVendorDoc,
                buildPlannerInputs,
                buildStructuralChanges,
                baselineToPropertyIndex,
                extractPropertySnapshot,
            } = await import('./vendors/figma/iterative/vendor-doc-flatten');
            const { matchNodes } = await import('./vendors/figma/iterative/match-confidence');
            const { createMergePlan } = await import('./vendors/figma/iterative/merge-planner');
            const { generateReport } = await import('./vendors/figma/iterative/sync-report');
            const { parseSyncBaseline } = await import('./vendors/figma/types');

            const existingDoc = existingSectionData as unknown as FigmaVendorDocument;
            const incomingDoc = buildResult.vendorDoc!;

            const currentFlat = flattenVendorDoc(existingDoc);
            const incomingFlat = flattenVendorDoc(incomingDoc);
            const matchResult = matchNodes(currentFlat, incomingFlat);

            const baselineRaw = existingDoc.pluginData?.['jay-sync-baseline-v1'];
            const baseline = parseSyncBaseline(baselineRaw);
            const baselineIndex = baseline ? baselineToPropertyIndex(baseline.nodes) : new Map();

            const designerOverrides = detectDesignerOverrides(
                matchResult.unmatchedCurrent,
                baselineIndex,
                existingDoc,
                extractPropertySnapshot,
            );

            const plannerInputs = buildPlannerInputs(
                matchResult.matches,
                baselineIndex,
                existingDoc,
                incomingDoc,
            );
            // Structural confidence: 'low' for unmatched nodes is intentional.
            // Unmatched nodes have no match to score against, so no confidence signal exists.
            // 'low' ensures destructive ops (removes) always require explicit confirmation
            // per locked policy. Adds are unaffected (always auto-applied regardless of confidence).
            // Future: contextual confidence from sibling match quality could promote to 'medium'.
            const structChanges = buildStructuralChanges(
                matchResult.unmatchedCurrent,
                matchResult.unmatchedIncoming,
                existingDoc,
                incomingDoc,
                'low',
                designerOverrides,
            );

            const plan = createMergePlan(plannerInputs, structChanges);
            const sessionId = `preview-${Date.now()}`;
            const report = generateReport(plan, sessionId);

            getLogger().info(
                `📋 Merge preview for ${pageUrl}: ${report.summary.updated} updates, ${report.summary.conflicted} conflicts`,
            );

            return { type: 'mergePreview', success: true, report };
        } catch (error) {
            getLogger().error('Failed merge preview:', error);
            return {
                type: 'mergePreview',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    const onMergeApply = async <TVendorDoc>(
        params: MergeApplyRequest<TVendorDoc>,
    ): Promise<MergeApplyResponse<TVendorDoc>> => {
        try {
            const { vendorId, pageUrl, existingSectionData, conflictResolutions } = params;

            if (!existingSectionData) {
                return {
                    type: 'mergeApply',
                    success: false,
                    error: 'No existing section data — use standard import for fresh imports',
                };
            }

            const buildResult = await buildIncomingVendorDoc(vendorId, pageUrl);
            if (buildResult.error) {
                return { type: 'mergeApply', success: false, error: buildResult.error };
            }

            const {
                flattenVendorDoc,
                buildPlannerInputs,
                buildStructuralChanges,
                baselineToPropertyIndex,
                extractPropertySnapshot,
            } = await import('./vendors/figma/iterative/vendor-doc-flatten');
            const { matchNodes } = await import('./vendors/figma/iterative/match-confidence');
            const { createMergePlan } = await import('./vendors/figma/iterative/merge-planner');
            const { applyMergePlan } = await import('./vendors/figma/iterative/merge-applier');
            const { parseSyncBaseline, parseSyncState } = await import('./vendors/figma/types');

            const existingDoc = existingSectionData as unknown as FigmaVendorDocument;
            const incomingDoc = buildResult.vendorDoc!;

            const currentFlat = flattenVendorDoc(existingDoc);
            const incomingFlat = flattenVendorDoc(incomingDoc);
            const matchResult = matchNodes(currentFlat, incomingFlat);

            const baselineRaw = existingDoc.pluginData?.['jay-sync-baseline-v1'];
            const baseline = parseSyncBaseline(baselineRaw);
            const baselineIndex = baseline ? baselineToPropertyIndex(baseline.nodes) : new Map();

            const designerOverrides = detectDesignerOverrides(
                matchResult.unmatchedCurrent,
                baselineIndex,
                existingDoc,
                extractPropertySnapshot,
            );

            const plannerInputs = buildPlannerInputs(
                matchResult.matches,
                baselineIndex,
                existingDoc,
                incomingDoc,
            );
            // See confidence rationale in onMergePreview above.
            const structChanges = buildStructuralChanges(
                matchResult.unmatchedCurrent,
                matchResult.unmatchedIncoming,
                existingDoc,
                incomingDoc,
                'low',
                designerOverrides,
            );
            const plan = createMergePlan(plannerInputs, structChanges);

            // Determine sectionSyncId
            const existingSyncState = parseSyncState(existingDoc.pluginData?.['jay-sync-state-v1']);
            const sectionSyncId = existingSyncState?.sectionSyncId ?? `sync-${Date.now()}`;
            const sessionId = `merge-${Date.now()}`;

            // Apply merge plan (pure — clones existingDoc internally)
            const applyResult = applyMergePlan({
                existingDoc,
                incomingDoc,
                plan,
                conflictResolutions: conflictResolutions as any,
                pageUrl,
                sessionId,
                sectionSyncId,
                matches: matchResult.matches,
            });

            getLogger().info(
                `✅ Merge applied for ${pageUrl}: ${applyResult.appliedOps.length} applied, ` +
                    `${applyResult.unresolvedConflicts.length} unresolved`,
            );

            return {
                type: 'mergeApply',
                success: true,
                vendorDoc: applyResult.mergedDoc as unknown as TVendorDoc,
                report: applyResult.report,
                syncState: applyResult.newSyncState,
                baseline: applyResult.newBaseline,
            };
        } catch (error) {
            getLogger().error('Failed merge apply:', error);
            return {
                type: 'mergeApply',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    };

    return {
        onPublish,
        onSaveImage,
        onHasImage,
        onGetImageData,
        onGetProjectInfo,
        onExport,
        onImport,
        onMergePreview,
        onMergeApply,
    };
}
