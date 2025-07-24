import path from 'path';
import fs from 'fs';
import type {
    PublishMessage,
    PublishComponent,
    PublishPage,
    PublishResponse,
    PublishStatus,
    SaveImageMessage,
    HasImageMessage,
    SaveImageResponse,
    HasImageResponse,
} from '@jay-framework/editor-protocol';
import type { JayConfig } from './config';
import {generateElementDefinitionFile, JAY_IMPORT_RESOLVER, parseJayFile} from "@jay-framework/compiler-jay-html";
import { JAY_EXTENSION } from "@jay-framework/compiler-shared";

const PAGE_FILENAME = `page${JAY_EXTENSION}`;

type CreatedJayHtml = {
    jayHtml: string,
    filename: string,
    dirname: string,
    fullPath: string
}

async function handlePagePublish(resolvedConfig: Required<JayConfig>, page: PublishPage): Promise<[PublishStatus, CreatedJayHtml]> {
    try {
        const pagesBasePath = path.resolve(resolvedConfig.devServer.pagesBase);

        // Convert route to file path
        const routePath = page.route === '/' ? '' : page.route;
        const dirname = path.join(pagesBasePath, routePath);
        const fullPath = path.join(dirname, PAGE_FILENAME);

        // Ensure directory exists
        await fs.promises.mkdir(dirname, {recursive: true});

        // Write the page content
        await fs.promises.writeFile(fullPath, page.jayHtml, 'utf-8');
        const createdJayHtml: CreatedJayHtml = ({
            jayHtml: page.jayHtml,
            filename: PAGE_FILENAME,
            dirname,
            fullPath
        })

        console.log(`📝 Published page: ${fullPath}`);

        return [{
            success: true,
            filePath: fullPath,
        }, createdJayHtml];
    } catch (error) {
        console.error(`Failed to publish page ${page.route}:`, error);
        return [{
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, undefined];
    }
};

async function handleComponentPublish(resolvedConfig: Required<JayConfig>, component: PublishComponent): Promise<[PublishStatus, CreatedJayHtml]> {
    try {
        const dirname = path.resolve(resolvedConfig.devServer.componentsBase);
        const filename = `${component.name}${JAY_EXTENSION}`
        const fullPath = path.join(dirname, filename);

        // Ensure components directory exists
        await fs.promises.mkdir(dirname, { recursive: true });

        // Write the component content
        await fs.promises.writeFile(fullPath, component.jayHtml, 'utf-8');
        const createdJayHtml: CreatedJayHtml = ({
            jayHtml: component.jayHtml,
            filename,
            dirname,
            fullPath
        })

        console.log(`🧩 Published component: ${fullPath}`);

        return [{
            success: true,
            filePath: fullPath,
        }, createdJayHtml];
    } catch (error) {
        console.error(`Failed to publish component ${component.name}:`, error);
        return [{
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, undefined];
    }
};


export function createEditorHandlers(config: Required<JayConfig>, tsConfigPath: string) {

    const onPublish = async (params: PublishMessage): Promise<PublishResponse> => {
        const status: PublishStatus[] = [];
        const createdJayHtmls: CreatedJayHtml[] = []

        // Handle pages if provided
        if (params.pages) {
            for (const page of params.pages) {
                const [pageStatus, createdJayHtml] = await handlePagePublish(config, page)
                status.push(pageStatus);
                if (pageStatus.success)
                    createdJayHtmls.push(createdJayHtml);
            }
        }

        // Handle components if provided
        if (params.components) {
            for (const component of params.components) {
                const [compStatus, createdJayHtml] = await handleComponentPublish(config, component);
                status.push(compStatus);
                if (compStatus.success)
                    createdJayHtmls.push(createdJayHtml);
            }
        }

        for (const {jayHtml, dirname, filename, fullPath} of createdJayHtmls) {
            const parsedJayHtml = await parseJayFile(jayHtml, dirname, filename, {relativePath: tsConfigPath}, JAY_IMPORT_RESOLVER)
            const definitionFile = generateElementDefinitionFile(parsedJayHtml)
            if (definitionFile.validations.length > 0)
                console.log(`failed to generate .d.ts for ${fullPath} with validation errors: ${definitionFile.validations.join('\n')}`);
            else
                await fs.promises.writeFile(fullPath + '.d.ts', definitionFile.val, 'utf-8');
        }


        return {
            type: 'publish',
            success: status.every((s) => s.success),
            status,
        };
    };

    const onSaveImage = async (params: SaveImageMessage): Promise<SaveImageResponse> => {
        try {
            const imagesDir = path.join(
                path.resolve(config.devServer.publicFolder),
                'images',
            );

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

    return {
        onPublish,
        onSaveImage,
        onHasImage,
    };
}
