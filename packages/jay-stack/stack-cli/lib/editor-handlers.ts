import path from 'path';
import fs from 'fs';
import type {
    PublishMessage,
    SaveImageMessage,
    HasImageMessage,
    PublishResponse,
    SaveImageResponse,
    HasImageResponse,
} from '@jay-framework/editor-protocol';
import { getConfigWithDefaults } from './config';
import type { JayConfig } from './config';

export function createEditorHandlers(config: JayConfig) {
    const resolvedConfig = getConfigWithDefaults(config);

    const onPublish = async (params: PublishMessage): Promise<PublishResponse> => {
        const status = [];

        for (const page of params.pages) {
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

                status.push({
                    success: true,
                    filePath: pageFile,
                });
            } catch (error) {
                console.error(`Failed to publish page ${page.route}:`, error);
                status.push({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
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
