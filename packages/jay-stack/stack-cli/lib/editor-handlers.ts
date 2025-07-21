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
import { getConfigWithDefaults } from './config';
import type { JayConfig } from './config';

export function createEditorHandlers(config: JayConfig) {
    const resolvedConfig = getConfigWithDefaults(config);

    const handlePagePublish = async (page: PublishPage): Promise<PublishStatus> => {
        try {
            const pagesBasePath = path.resolve(resolvedConfig.devServer.pagesBase);

            // Convert route to file path
            const routePath = page.route === '/' ? '' : page.route;
            const pageDir = path.join(pagesBasePath, routePath);
            const pageFile = path.join(pageDir, 'page.jay-html');

            // Ensure directory exists
            await fs.promises.mkdir(pageDir, { recursive: true });

            // Write the page content
            await fs.promises.writeFile(pageFile, page.jayHtml, 'utf-8');

            console.log(`📝 Published page: ${pageFile}`);

            return {
                success: true,
                filePath: pageFile,
            };
        } catch (error) {
            console.error(`Failed to publish page ${page.route}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    const handleComponentPublish = async (component: PublishComponent): Promise<PublishStatus> => {
        try {
            const projectRoot = path.resolve(resolvedConfig.devServer.pagesBase, '..');
            const componentsDir = path.join(projectRoot, 'src', 'components');
            const componentFile = path.join(componentsDir, `${component.name}.jay-html`);

            // Ensure components directory exists
            await fs.promises.mkdir(componentsDir, { recursive: true });

            // Write the component content
            await fs.promises.writeFile(componentFile, component.jayHtml, 'utf-8');

            console.log(`🧩 Published component: ${componentFile}`);

            return {
                success: true,
                filePath: componentFile,
            };
        } catch (error) {
            console.error(`Failed to publish component ${component.name}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
}

    const onPublish = async (params: PublishMessage): Promise<PublishResponse> => {
        const status = [];

        // Handle pages if provided
        if (params.pages) {
            for (const page of params.pages) {
                status.push(await handlePagePublish(page));
            }
        }

        // Handle components if provided
        if (params.components) {
            for (const component of params.components) {
                status.push(await handleComponentPublish(component));
            }
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
                path.resolve(resolvedConfig.devServer.publicFolder),
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
                path.resolve(resolvedConfig.devServer.publicFolder),
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
