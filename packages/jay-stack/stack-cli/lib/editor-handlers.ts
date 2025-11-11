import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
import { parse } from 'node-html-parser';
import type {
    PublishMessage,
    PublishComponent,
    PublishPage,
    PublishResponse,
    PublishStatus,
    SaveImageMessage,
    HasImageMessage,
    GetProjectConfigurationMessage,
    SaveImageResponse,
    HasImageResponse,
    GetProjectConfigurationResponse,
    ProjectConfiguration,
    ProjectPage,
    ProjectComponent,
    InstalledApp,
} from '@jay-framework/editor-protocol';
import type { JayConfig } from './config';
import {
    generateElementDefinitionFile,
    JAY_IMPORT_RESOLVER,
    parseJayFile,
} from '@jay-framework/compiler-jay-html';
import { JAY_EXTENSION, JAY_CONTRACT_EXTENSION } from '@jay-framework/compiler-shared';

const PAGE_FILENAME = `page${JAY_EXTENSION}`;

// Helper function to extract headless components from jay-html content
function extractHeadlessComponents(jayHtmlContent: string): {
    contract: string;
    src: string;
    name: string;
    key: string;
}[] {
    const root = parse(jayHtmlContent);
    const headlessScripts = root.querySelectorAll('script[type="application/jay-headless"]');

    return headlessScripts.map((script) => ({
        contract: script.getAttribute('contract') || '',
        src: script.getAttribute('src') || '',
        name: script.getAttribute('name') || '',
        key: script.getAttribute('key') || '',
    }));
}

// Helper function to scan pages in the project
async function scanProjectPages(pagesBasePath: string): Promise<ProjectPage[]> {
    const pages: ProjectPage[] = [];

    async function scanDirectory(dirPath: string, urlPath: string = '') {
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    // Handle parameterized routes like [slug]
                    const isParam = entry.name.startsWith('[') && entry.name.endsWith(']');
                    const segmentUrl = isParam ? `:${entry.name.slice(1, -1)}` : entry.name;
                    const newUrlPath = urlPath + '/' + segmentUrl;
                    await scanDirectory(fullPath, newUrlPath);
                } else if (entry.name === PAGE_FILENAME) {
                    // Found a page file
                    const pageUrl = urlPath || '/';
                    const pageName = path.basename(dirPath) || 'home';

                    try {
                        const jayHtmlContent = await fs.promises.readFile(fullPath, 'utf-8');
                        const usedComponents = extractHeadlessComponents(jayHtmlContent);

                        pages.push({
                            name: pageName,
                            url: pageUrl,
                            filePath: fullPath,
                            usedComponents,
                        });
                    } catch (error) {
                        console.warn(`Failed to read page file ${fullPath}:`, error);
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to scan directory ${dirPath}:`, error);
        }
    }

    await scanDirectory(pagesBasePath);
    return pages;
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

export function createEditorHandlers(config: Required<JayConfig>, tsConfigPath: string) {
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

    const onGetProjectConfiguration = async (
        params: GetProjectConfigurationMessage,
    ): Promise<GetProjectConfigurationResponse> => {
        try {
            const pagesBasePath = path.resolve(config.devServer.pagesBase);
            const componentsBasePath = path.resolve(config.devServer.componentsBase);
            const configBasePath = path.resolve('./config');

            // Scan project structure
            const [projectName, pages, components, installedApps] = await Promise.all([
                getProjectName(configBasePath),
                scanProjectPages(pagesBasePath),
                scanProjectComponents(componentsBasePath),
                scanInstalledApps(configBasePath),
            ]);

            const projectConfiguration: ProjectConfiguration = {
                name: projectName,
                localPath: process.cwd(),
                pages,
                components,
                installedApps,
            };

            console.log(`📋 Retrieved project configuration: ${projectName}`);

            return {
                type: 'getProjectConfiguration',
                success: true,
                configuration: projectConfiguration,
            };
        } catch (error) {
            console.error('Failed to get project configuration:', error);
            return {
                type: 'getProjectConfiguration',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                configuration: {
                    name: 'Error',
                    localPath: process.cwd(),
                    pages: [],
                    components: [],
                    installedApps: [],
                },
            };
        }
    };

    return {
        onPublish,
        onSaveImage,
        onHasImage,
        onGetProjectConfiguration,
    };
}
