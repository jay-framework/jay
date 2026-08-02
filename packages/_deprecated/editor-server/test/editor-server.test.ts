import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorServer, createEditorServer } from '../lib';
import { createDefaultHandlers } from './protocol-handlers';
import { createEditorClient } from '@jay-framework/editor-client';
import { join } from 'path';

describe('Editor Server', () => {
    let server: EditorServer;

    beforeEach(() => {
        // No filesystem setup needed for memory-based tests
    });

    afterEach(async () => {
        if (server) {
            await server.stop();
        }
    });

    it('should start server and return port and editor ID', async () => {
        const fixedEditorId = 'test-editor-id';
        server = createEditorServer({
            editorId: fixedEditorId,
        });

        const result = await server.start();

        expect(result.port).toBeGreaterThan(0);
        expect(result.editorId).toBe(fixedEditorId);
    });

    it('should default to "init" when no editor ID is provided', async () => {
        server = createEditorServer({});

        const result = await server.start();

        expect(result.port).toBeGreaterThan(0);
        expect(result.editorId).toBe('init');
    });
});

describe('Editor Server End-to-End Tests', () => {
    let server: EditorServer;
    let client: any;
    let serverInfo: { port: number; editorId: string };
    let memoryFileSystem: { files: Map<string, string | Buffer>; directories: Set<string> };

    beforeEach(async () => {
        // Initialize memory filesystem
        memoryFileSystem = {
            files: new Map(),
            directories: new Set(),
        };

        // Use a fixed editorId to avoid race conditions
        const fixedEditorId = 'test-editor-id';

        // Create server with fixed editorId
        server = createEditorServer({
            editorId: fixedEditorId,
        });

        const handlers = createDefaultHandlers({
            projectRoot: '/test-project',
            memoryFileSystem,
        });

        server.onPublish(handlers.handlePublish.bind(handlers));
        server.onSaveImage(handlers.handleSaveImage.bind(handlers));
        server.onHasImage(handlers.handleHasImage.bind(handlers));

        // Start server
        serverInfo = await server.start();

        // Create client with matching editorId
        client = createEditorClient({
            portRange: [serverInfo.port, serverInfo.port],
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: fixedEditorId,
        });
    });

    afterEach(async () => {
        if (client) {
            await client.disconnect();
        }
        if (server) {
            await server.stop();
        }
    });

    it('should establish connection between client and server', async () => {
        await client.connect();
        expect(client.getConnectionState()).toBe('connected');
    });

    it('should handle publish operation end-to-end', async () => {
        await client.connect();

        const result = await client.publish({
            type: 'publish',
            pages: [
                {
                    route: '/test',
                    jayHtml: '<div>Test content</div>',
                    name: 'test-page',
                },
            ] as [
                {
                    route: string;
                    jayHtml: string;
                    name: string;
                },
            ],
        });

        expect(result.status).toHaveLength(1);
        expect(result.status[0].success).toBe(true);
        expect(result.status[0].filePath).toContain('test-page.jay-html');

        // Verify file was created in memory
        const expectedPath = '/test-project/test/test-page.jay-html';
        expect(memoryFileSystem.files.has(expectedPath)).toBe(true);
        expect(memoryFileSystem.files.get(expectedPath)).toBe('<div>Test content</div>');
    });

    it('should handle save image operation end-to-end', async () => {
        await client.connect();

        const base64Image =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

        const result = await client.saveImage({
            type: 'saveImage',
            imageId: 'test-image',
            imageData: base64Image,
        });

        expect(result.success).toBe(true);
        expect(result.imageUrl).toBe('/assets/test-image.png');

        // Verify file was created in memory
        const expectedPath = '/test-project/public/assets/test-image.png';
        expect(memoryFileSystem.files.has(expectedPath)).toBe(true);
        expect(memoryFileSystem.files.get(expectedPath)).toBeInstanceOf(Buffer);
    });

    it('should handle has image operation end-to-end', async () => {
        await client.connect();

        // First save an image
        const base64Image =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        await client.saveImage({
            type: 'saveImage',
            imageId: 'test-image',
            imageData: base64Image,
        });

        // Then check if it exists
        const result = await client.hasImage({
            type: 'hasImage',
            imageId: 'test-image',
        });

        expect(result.exists).toBe(true);
        expect(result.imageUrl).toBe('/assets/test-image.png');

        // Check for non-existent image
        const nonExistentResult = await client.hasImage({
            type: 'hasImage',
            imageId: 'non-existent-image',
        });

        expect(nonExistentResult.exists).toBe(false);
    });

    it('should handle multiple publish operations', async () => {
        await client.connect();

        const result = await client.publish({
            type: 'publish',
            pages: [
                {
                    route: '/page1',
                    jayHtml: '<div>Page 1 content</div>',
                    name: 'page1',
                },
                {
                    route: '/page2',
                    jayHtml: '<div>Page 2 content</div>',
                    name: 'page2',
                },
            ] as Array<{
                route: string;
                jayHtml: string;
                name: string;
            }>,
        });

        expect(result.status).toHaveLength(2);
        expect(result.status[0].success).toBe(true);
        expect(result.status[1].success).toBe(true);
        expect(result.status[0].filePath).toContain('page1.jay-html');
        expect(result.status[1].filePath).toContain('page2.jay-html');

        // Verify files were created in memory
        const path1 = '/test-project/page1/page1.jay-html';
        const path2 = '/test-project/page2/page2.jay-html';
        expect(memoryFileSystem.files.has(path1)).toBe(true);
        expect(memoryFileSystem.files.has(path2)).toBe(true);
        expect(memoryFileSystem.files.get(path1)).toBe('<div>Page 1 content</div>');
        expect(memoryFileSystem.files.get(path2)).toBe('<div>Page 2 content</div>');
    });

    it('should handle server in configured mode', async () => {
        // Stop the current server
        await server.stop();
        await client.disconnect();

        // Create a new server with memory filesystem
        const configuredMemoryFileSystem = {
            files: new Map<string, string | Buffer>(),
            directories: new Set<string>(),
        };

        const configuredServer = createEditorServer({});

        const handlers = createDefaultHandlers({
            projectRoot: '/configured-project',
            memoryFileSystem: configuredMemoryFileSystem,
        });

        configuredServer.onPublish(handlers.handlePublish.bind(handlers));
        configuredServer.onSaveImage(handlers.handleSaveImage.bind(handlers));
        configuredServer.onHasImage(handlers.handleHasImage.bind(handlers));

        const configuredServerInfo = await configuredServer.start();

        // Create client with matching editor ID
        const configuredClient = createEditorClient({
            portRange: [configuredServerInfo.port, configuredServerInfo.port],
            scanTimeout: 1000,
            retryAttempts: 1,
            editorId: configuredServerInfo.editorId,
        });

        await configuredClient.connect();
        expect(configuredClient.getConnectionState()).toBe('connected');

        // Test that operations work
        const result = await configuredClient.publish({
            type: 'publish',
            pages: [
                {
                    route: '/configured',
                    jayHtml: '<div>Configured content</div>',
                    name: 'configured-page',
                },
            ] as [
                {
                    route: string;
                    jayHtml: string;
                    name: string;
                },
            ],
        });

        expect(result.status[0].success).toBe(true);

        // Verify file was created in memory
        const expectedPath = '/configured-project/configured/configured-page.jay-html';
        expect(configuredMemoryFileSystem.files.has(expectedPath)).toBe(true);

        await configuredClient.disconnect();
        await configuredServer.stop();
    });

    it('should handle concurrent operations', async () => {
        await client.connect();

        // Perform multiple operations concurrently
        const [publishResult, saveImageResult, hasImageResult] = await Promise.all([
            client.publish({
                type: 'publish',
                pages: [
                    {
                        route: '/concurrent',
                        jayHtml: '<div>Concurrent content</div>',
                        name: 'concurrent-page',
                    },
                ] as [
                    {
                        route: string;
                        jayHtml: string;
                        name: string;
                    },
                ],
            }),
            client.saveImage({
                type: 'saveImage',
                imageId: 'concurrent-image',
                imageData:
                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            }),
            client.hasImage({
                type: 'hasImage',
                imageId: 'non-existent-concurrent',
            }),
        ]);

        expect(publishResult.status[0].success).toBe(true);
        expect(saveImageResult.success).toBe(true);
        expect(hasImageResult.exists).toBe(false);

        // Verify files were created in memory
        const publishPath = '/test-project/concurrent/concurrent-page.jay-html';
        const imagePath = '/test-project/public/assets/concurrent-image.png';
        expect(memoryFileSystem.files.has(publishPath)).toBe(true);
        expect(memoryFileSystem.files.has(imagePath)).toBe(true);
    });
}, 30000); // Increase timeout for end-to-end tests
