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
    InstalledApp,
    ContractTag as ProtocolContractTag,
    ContractSchema,
    InstalledAppContracts,
    Plugin,
    PluginManifest,
} from '@jay-framework/editor-protocol';
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

// Helper function to resolve contract files from installed apps using Node.js module resolution
function resolveAppContractPath(
    appModule: string,
    contractFileName: string,
    projectRootPath: string,
): string | null {
    try {
        // Create a require function relative to the project root
        const require = createRequire(path.join(projectRootPath, 'package.json'));

        // Use Node.js module resolution with the module name
        const modulePath = `${appModule}/${contractFileName}`;
        const resolvedPath = require.resolve(modulePath);

        return resolvedPath;
    } catch (error) {
        console.warn(
            `Failed to resolve contract: ${appModule}/${contractFileName}`,
            error instanceof Error ? error.message : error,
        );
        return null;
    }
}

// Helper function to scan installed app contracts
async function scanInstalledAppContracts(
    configBasePath: string,
    projectRootPath: string,
): Promise<{ [appName: string]: InstalledAppContracts }> {
    const installedAppContracts: { [appName: string]: InstalledAppContracts } = {};
    const installedAppsPath = path.join(configBasePath, 'installedApps');

    try {
        if (!fs.existsSync(installedAppsPath)) {
            return installedAppContracts;
        }

        const appDirs = await fs.promises.readdir(installedAppsPath, { withFileTypes: true });

        for (const appDir of appDirs) {
            if (appDir.isDirectory()) {
                const appConfigPath = path.join(installedAppsPath, appDir.name, 'app.conf.yaml');

                try {
                    if (fs.existsSync(appConfigPath)) {
                        const configContent = await fs.promises.readFile(appConfigPath, 'utf-8');
                        const appConfig = YAML.parse(configContent);
                        const appName = appConfig.name || appDir.name;
                        const appModule = appConfig.module || appDir.name;

                        const appContracts: InstalledAppContracts = {
                            appName,
                            module: appModule,
                            pages: [],
                            components: [],
                        };

                        // Scan app pages and their contracts
                        if (appConfig.pages && Array.isArray(appConfig.pages)) {
                            for (const page of appConfig.pages) {
                                if (
                                    page.headless_components &&
                                    Array.isArray(page.headless_components)
                                ) {
                                    for (const component of page.headless_components) {
                                        if (component.contract) {
                                            // Resolve contract path using Node.js module resolution
                                            const contractPath = resolveAppContractPath(
                                                appModule,
                                                component.contract,
                                                projectRootPath,
                                            );

                                            if (contractPath) {
                                                const contractSchema =
                                                    await parseContractFile(contractPath);
                                                if (contractSchema) {
                                                    appContracts.pages.push({
                                                        pageName: page.name,
                                                        contractSchema,
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Scan app components and their contracts
                        if (appConfig.components && Array.isArray(appConfig.components)) {
                            for (const component of appConfig.components) {
                                if (
                                    component.headless_components &&
                                    Array.isArray(component.headless_components)
                                ) {
                                    for (const headlessComp of component.headless_components) {
                                        if (headlessComp.contract) {
                                            // Resolve contract path using Node.js module resolution
                                            const contractPath = resolveAppContractPath(
                                                appModule,
                                                headlessComp.contract,
                                                projectRootPath,
                                            );

                                            if (contractPath) {
                                                const contractSchema =
                                                    await parseContractFile(contractPath);
                                                if (contractSchema) {
                                                    appContracts.components.push({
                                                        componentName: component.name,
                                                        contractSchema,
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        installedAppContracts[appName] = appContracts;
                    }
                } catch (error) {
                    console.warn(`Failed to parse app config ${appConfigPath}:`, error);
                }
            }
        }
    } catch (error) {
        console.warn(`Failed to scan installed apps directory ${installedAppsPath}:`, error);
    }

    return installedAppContracts;
}

// Helper function to build full page contracts (combines page contracts with installed app components)
// Helper function to extract headless components from jay-html content and resolve to app/component names
function extractHeadlessComponents(
    jayHtmlContent: string,
    installedApps: InstalledApp[],
    installedAppContracts: { [appName: string]: InstalledAppContracts },
): {
    appName: string;
    componentName: string;
    key: string;
}[] {
    const root = parse(jayHtmlContent);
    const headlessScripts = root.querySelectorAll('script[type="application/jay-headless"]');

    const resolvedComponents: {
        appName: string;
        componentName: string;
        key: string;
    }[] = [];

    for (const script of headlessScripts) {
        const src = script.getAttribute('src') || '';
        const name = script.getAttribute('name') || '';
        const key = script.getAttribute('key') || '';

        // Resolve src and name to appName and componentName
        let resolved = false;
        for (const app of installedApps) {
            // Check if app module matches src
            if (app.module !== src && app.name !== src) {
                continue;
            }

            // Check in app pages
            for (const appPage of app.pages) {
                for (const headlessComp of appPage.headless_components) {
                    if (headlessComp.name === name && headlessComp.key === key) {
                        const appContracts = installedAppContracts[app.name];
                        if (appContracts) {
                            const matchingPageContract = appContracts.pages.find(
                                (pc) => pc.pageName === appPage.name,
                            );
                            if (matchingPageContract) {
                                resolvedComponents.push({
                                    appName: app.name,
                                    componentName: appPage.name,
                                    key,
                                });
                                resolved = true;
                                break;
                            }
                        }
                    }
                }
                if (resolved) break;
            }
            if (resolved) break;

            // Check in app components
            for (const appComponent of app.components) {
                for (const headlessComp of appComponent.headless_components) {
                    if (headlessComp.name === name && headlessComp.key === key) {
                        const appContracts = installedAppContracts[app.name];
                        if (appContracts) {
                            const matchingComponentContract = appContracts.components.find(
                                (cc) => cc.componentName === appComponent.name,
                            );
                            if (matchingComponentContract) {
                                resolvedComponents.push({
                                    appName: app.name,
                                    componentName: appComponent.name,
                                    key,
                                });
                                resolved = true;
                                break;
                            }
                        }
                    }
                }
                if (resolved) break;
            }
            if (resolved) break;
        }

        // If not resolved, keep original values (this shouldn't happen in normal cases)
        if (!resolved) {
            resolvedComponents.push({
                appName: src,
                componentName: name,
                key,
            });
        }
    }

    return resolvedComponents;
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

// Helper function to scan installed apps
async function scanInstalledApps(configBasePath: string): Promise<InstalledApp[]> {
    const installedApps: InstalledApp[] = [];
    const installedAppsPath = path.join(configBasePath, 'installedApps');

    try {
        if (!fs.existsSync(installedAppsPath)) {
            return installedApps;
        }

        const appDirs = await fs.promises.readdir(installedAppsPath, { withFileTypes: true });

        for (const appDir of appDirs) {
            if (appDir.isDirectory()) {
                const appConfigPath = path.join(installedAppsPath, appDir.name, 'app.conf.yaml');

                try {
                    if (fs.existsSync(appConfigPath)) {
                        const configContent = await fs.promises.readFile(appConfigPath, 'utf-8');
                        const appConfig = YAML.parse(configContent);

                        installedApps.push({
                            name: appConfig.name || appDir.name,
                            module: appConfig.module || appDir.name,
                            pages: appConfig.pages || [],
                            components: appConfig.components || [],
                            config_map: appConfig.config_map || [],
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to parse app config ${appConfigPath}:`, error);
                }
            }
        }
    } catch (error) {
        console.warn(`Failed to scan installed apps directory ${installedAppsPath}:`, error);
    }

    return installedApps;
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
    const [projectName, components, installedApps, plugins] = await Promise.all([
        getProjectName(configBasePath),
        scanProjectComponents(componentsBasePath),
        scanInstalledApps(configBasePath),
        scanPlugins(projectRootPath),
    ]);

    // Scan installed app contracts
    const installedAppContracts = await scanInstalledAppContracts(configBasePath, projectRootPath);

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
                usedComponents = extractHeadlessComponents(
                    jayHtmlContent,
                    installedApps,
                    installedAppContracts,
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
                    // Resolve components - supports both new (plugin/contract) and old (src/name) syntax
                    for (const comp of pageConfig.used_components) {
                        const key = comp.key || '';
                        let src = '';
                        let name = '';

                        // NEW SYNTAX: plugin + contract
                        if (comp.plugin && comp.contract) {
                            // For plugin-based references, we look up the plugin in the plugins array
                            const plugin = plugins.find((p) => p.manifest.name === comp.plugin);
                            if (plugin && plugin.manifest.contracts) {
                                const contract = plugin.manifest.contracts.find(
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
                            continue;
                        }

                        // OLD SYNTAX: src + name
                        src = comp.src || '';
                        name = comp.name || '';

                        let resolved = false;
                        for (const app of installedApps) {
                            // Check if app module matches src
                            if (app.module !== src && app.name !== src) {
                                continue;
                            }

                            // Check in app pages
                            for (const appPage of app.pages) {
                                for (const headlessComp of appPage.headless_components) {
                                    if (headlessComp.name === name && headlessComp.key === key) {
                                        const appContracts = installedAppContracts[app.name];
                                        if (appContracts) {
                                            const matchingPageContract = appContracts.pages.find(
                                                (pc) => pc.pageName === appPage.name,
                                            );
                                            if (matchingPageContract) {
                                                usedComponents.push({
                                                    appName: app.name,
                                                    componentName: appPage.name,
                                                    key,
                                                });
                                                resolved = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                                if (resolved) break;
                            }
                            if (resolved) break;

                            // Check in app components
                            for (const appComponent of app.components) {
                                for (const headlessComp of appComponent.headless_components) {
                                    if (headlessComp.name === name && headlessComp.key === key) {
                                        const appContracts = installedAppContracts[app.name];
                                        if (appContracts) {
                                            const matchingComponentContract =
                                                appContracts.components.find(
                                                    (cc) => cc.componentName === appComponent.name,
                                                );
                                            if (matchingComponentContract) {
                                                usedComponents.push({
                                                    appName: app.name,
                                                    componentName: appComponent.name,
                                                    key,
                                                });
                                                resolved = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                                if (resolved) break;
                            }
                            if (resolved) break;
                        }

                        // If not resolved, keep original values
                        if (!resolved) {
                            usedComponents.push({
                                appName: src,
                                componentName: name,
                                key,
                            });
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
            contractSchema,
            usedComponents,
        });
    });

    return {
        name: projectName,
        localPath: projectRootPath,
        pages,
        components,
        installedApps,
        installedAppContracts,
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

    return {
        onPublish,
        onSaveImage,
        onHasImage,
        onGetProjectInfo,
    };
}
