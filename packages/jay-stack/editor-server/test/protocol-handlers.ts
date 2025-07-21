import { join } from 'path';
import type {
    PublishMessage,
    SaveImageMessage,
    HasImageMessage,
    PublishResponse,
    SaveImageResponse,
    HasImageResponse,
} from '@jay-framework/editor-protocol';
import {
    createPublishResponse,
    createSaveImageResponse,
    createHasImageResponse,
} from '@jay-framework/editor-protocol';

export interface DefaultHandlersOptions {
    projectRoot: string;
    assetsDir?: string;
    // For testing: in-memory file system
    memoryFileSystem?: {
        files: Map<string, string | Buffer>;
        directories: Set<string>;
    };
}

export class DefaultProtocolHandlers {
    private projectRoot: string;
    private assetsDir: string;
    private memoryFileSystem?: DefaultHandlersOptions['memoryFileSystem'];

    constructor(options: DefaultHandlersOptions) {
        this.projectRoot = options.projectRoot;
        this.assetsDir = options.assetsDir || join(this.projectRoot, 'public', 'assets');
        this.memoryFileSystem = options.memoryFileSystem;

        // Ensure assets directory exists in memory filesystem
        if (this.memoryFileSystem) {
            this.memoryFileSystem.directories.add(this.assetsDir);
        }
    }

    async handlePublish(params: PublishMessage): Promise<PublishResponse> {
        const { pages, components } = params;
        const results: PublishResponse['status'] = [];

        // Handle pages
        if (pages) {
            for (const page of pages) {
                try {
                    const { route, jayHtml, name } = page;
                    const filePath = join(this.projectRoot, route, `${name}.jay-html`);

                    // Ensure directory exists
                    const dir = join(this.projectRoot, route);
                    if (this.memoryFileSystem) {
                        this.memoryFileSystem.directories.add(dir);
                        this.memoryFileSystem.files.set(filePath, jayHtml);
                    }

                    results.push({
                        success: true,
                        filePath: filePath,
                    });
                } catch (error) {
                    results.push({
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }
        }
        
        // Handle components
        if (components) {
            for (const component of components) {
                try {
                    const { jayHtml, name } = component;
                    const componentsDir = join(this.projectRoot, 'src', 'components');
                    const filePath = join(componentsDir, `${name}.jay-html`);

                    // Ensure components directory exists
                    if (this.memoryFileSystem) {
                        this.memoryFileSystem.directories.add(componentsDir);
                        this.memoryFileSystem.files.set(filePath, jayHtml);
                    }

                    results.push({
                        success: true,
                        filePath: filePath,
                    });
                } catch (error) {
                    results.push({
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }
        }

        return createPublishResponse(results);
    }

    async handleSaveImage(params: SaveImageMessage): Promise<SaveImageResponse> {
        const { imageId, imageData } = params;

        try {
            // Remove data URL prefix if present
            const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            // Determine file extension from image data
            const extension = this.getImageExtension(imageData);
            const fileName = `${imageId}${extension}`;
            const filePath = join(this.assetsDir, fileName);

            // Write the image file to memory
            if (this.memoryFileSystem) {
                this.memoryFileSystem.files.set(filePath, buffer);
            }

            // Return the URL that will be accessible via the dev server
            const imageUrl = `/assets/${fileName}`;

            return createSaveImageResponse(true, imageUrl);
        } catch (error) {
            return createSaveImageResponse(
                false,
                undefined,
                error instanceof Error ? error.message : 'Unknown error',
            );
        }
    }

    async handleHasImage(params: HasImageMessage): Promise<HasImageResponse> {
        const { imageId } = params;

        try {
            // Check for common image extensions
            const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

            for (const extension of extensions) {
                const fileName = `${imageId}${extension}`;
                const filePath = join(this.assetsDir, fileName);

                const fileExists = this.memoryFileSystem
                    ? this.memoryFileSystem.files.has(filePath)
                    : false;

                if (fileExists) {
                    const imageUrl = `/assets/${fileName}`;
                    return createHasImageResponse(true, imageUrl);
                }
            }

            return createHasImageResponse(false);
        } catch (error) {
            return createHasImageResponse(false);
        }
    }

    private getImageExtension(imageData: string): string {
        if (imageData.startsWith('data:image/png;base64,')) return '.png';
        if (imageData.startsWith('data:image/jpeg;base64,')) return '.jpg';
        if (imageData.startsWith('data:image/jpg;base64,')) return '.jpg';
        if (imageData.startsWith('data:image/gif;base64,')) return '.gif';
        if (imageData.startsWith('data:image/webp;base64,')) return '.webp';
        if (imageData.startsWith('data:image/svg+xml;base64,')) return '.svg';

        // Default to PNG if we can't determine the type
        return '.png';
    }
}

export function createDefaultHandlers(options: DefaultHandlersOptions): DefaultProtocolHandlers {
    return new DefaultProtocolHandlers(options);
}
