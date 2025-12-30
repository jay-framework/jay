import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
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
    Contract,
    Plugin,
} from '@jay-framework/editor-protocol';
import type { JayConfig } from './config';
import {
    generateElementDefinitionFile,
    JAY_IMPORT_RESOLVER,
    parseJayFile,
    parseContract,
    ContractTag,
} from '@jay-framework/compiler-jay-html';
import {
    JAY_EXTENSION,
    JAY_CONTRACT_EXTENSION,
    LOCAL_PLUGIN_PATH,
    resolvePluginManifest,
} from '@jay-framework/compiler-shared';

const PAGE_FILENAME = `page${JAY_EXTENSION}`;
const PAGE_CONTRACT_FILENAME = `page${JAY_CONTRACT_EXTENSION}`;
const PAGE_CONFIG_FILENAME = 'page.conf.yaml';


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
// Helper function to parse a contract file and return Contract
async function parseContractFile(contractFilePath: string): Promise<Contract | null> {
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
): Promise<ContractTag[]> {
    const resolvedTags: ContractTag[] = [];

    for (const tag of tags) {
        if (tag.link) {
            // This is a linked sub-contract - load it from the file
            try {
                const linkedPath = path.resolve(baseDir, tag.link);
                const linkedContract = await parseContractFile(linkedPath);

                if (linkedContract) {
                    // Create a sub-contract tag with the linked contract's tags
                    const resolvedTag: ContractTag = {
                        tag: tag.tag,
                        type: tag.type, // Keep the original enum type
                        tags: linkedContract.tags, // Use tags from linked contract
                    };

                    if (tag.required !== undefined) {
                        resolvedTag.required = tag.required;
                    }

                    if (tag.repeated !== undefined) {
                        resolvedTag.repeated = tag.repeated;
                    }

                    if (tag.trackBy !== undefined) {
                        resolvedTag.trackBy = tag.trackBy;
                    }

                    resolvedTags.push(resolvedTag);
                } else {
                    console.warn(`Failed to load linked contract: ${tag.link} from ${baseDir}`);
                    // Fall back to including the original tag
                    resolvedTags.push(tag);
                }
            } catch (error) {
                console.warn(`Error resolving linked contract ${tag.link}:`, error);
                // Fall back to including the original tag
                resolvedTags.push(tag);
            }
        } else if (tag.tags) {
            // This is an inline sub-contract - recursively resolve its tags
            const resolvedSubTags = await resolveLinkedTags(tag.tags, baseDir);
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
            console.warn(
                `Jay-HTML parsing warnings for ${pageFilePath}:`,
                parsedJayHtml.validations,
            );
        }

        if (!parsedJayHtml.val) {
            console.warn(`Failed to parse jay-html file: ${pageFilePath}`);
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
        console.warn(`Failed to parse jay-html content for ${pageFilePath}:`, error);
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
        console.warn(`Failed to scan components directory ${componentsBasePath}:`, error);
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
        console.warn(`Failed to read project config ${projectConfigPath}:`, error);
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
        console.warn(`Failed to scan local plugins directory ${localPluginsDir}:`, error);
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
            console.warn('package.json not found');
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
        console.error('Error finding plugins from package.json:', error);
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

        console.log(`Found ${allPluginNames.length} plugins: ${allPluginNames.join(', ')}`);

        // For now, return basic plugin structure with names
        // This can be expanded later to load full plugin manifests and contracts
        for (const pluginName of allPluginNames) {
            const manifest = resolvePluginManifest(projectRootPath, pluginName);
            if (manifest.validations.length > 0) {
                console.warn(
                    `Failed to resolve plugin manifest for ${pluginName}:`,
                    manifest.validations,
                );
                continue;
            }
            if (!manifest.val) {
                console.warn(
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
                        console.warn(
                            `Failed to resolve plugin component for ${pluginName}:${contract.name}:`,
                            resolveResult.validations,
                        );
                        return null;
                    }
                    if (!resolveResult.val) {
                        console.warn(
                            `Failed to resolve plugin component for ${pluginName}:${contract.name}:`,
                            resolveResult.validations,
                        );
                        return null;
                    }

                    const contractLoadResult = JAY_IMPORT_RESOLVER.loadContract(
                        resolveResult.val.contractPath,
                    );
                    if (contractLoadResult.validations.length > 0) {
                        console.warn(
                            `Failed to load contract for ${pluginName}:${contract.name}:`,
                            contractLoadResult.validations,
                        );
                        return null;
                    }
                    if (!contractLoadResult.val) {
                        console.warn(
                            `Failed to load contract for ${pluginName}:${contract.name}:`,
                            contractLoadResult.validations,
                        );
                        return null;
                    }
                    return contractLoadResult.val;
                }),
            });
        }
    } catch (error) {
        console.error('Error scanning plugins:', error);
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
        let contract: Contract | undefined;

        // Parse contract if exists
        if (hasPageContract) {
            try {
                const parsedContract = await parseContractFile(contractPath);
                if (parsedContract) {
                    contract = parsedContract;
                }
            } catch (error) {
                console.warn(`Failed to parse contract file ${contractPath}:`, error);
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
                console.warn(`Failed to read page file ${pageFilePath}:`, error);
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
                                const contract = plugin.contracts.find(
                                    (c) => c.name === comp.contract,
                                );
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
                            console.warn(
                                `Invalid component definition in ${pageConfigPath}: Only plugin/contract syntax is supported for headless components. Found:`,
                                comp,
                            );
                        }
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
            contract,
            usedComponents,
        });
    });

    return {
        name: projectName,
        localPath: projectRootPath,
        pages,
        components,
        plugins,
        installedApps: [],
        installedAppContracts: {},
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
            console.log(`   plugins: ${info.plugins.length}`);

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

    return {
        onPublish,
        onSaveImage,
        onHasImage,
        onGetProjectInfo,
    };
}
