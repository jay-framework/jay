import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { createEditorHandlers } from '../../lib/editor-handlers';
import type {
    ExportMessage,
    ImportMessage,
    FigmaVendorDocument,
} from '@jay-framework/editor-protocol';
import type { JayConfig } from '../../lib/config';

describe('Export/Import Integration', () => {
    const testDir = path.join(process.cwd(), 'tmp-test-vendor-integration');
    const config: Required<JayConfig> = {
        devServer: {
            portRange: [3000, 3010],
            pagesBase: path.join(testDir, 'pages'),
            componentsBase: path.join(testDir, 'components'),
            publicFolder: path.join(testDir, 'public'),
            configBase: path.join(testDir, 'config'),
        },
        editorServer: {
            portRange: [3101, 3200],
            editorId: 'test-editor',
        },
    };

    beforeEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Export Handler', () => {
        it('should export Figma document and generate jay-html', async () => {
            const handlers = createEditorHandlers(config, './tsconfig.json', process.cwd());

            const exportMsg: ExportMessage<FigmaVendorDocument> = {
                type: 'export',
                vendorId: 'figma',
                pageUrl: '/home',
                vendorDoc: {
                    id: 'section-1',
                    name: 'Home Page',
                    type: 'SECTION',
                    pluginData: { jpage: 'true', urlRoute: '/home' },
                    children: [
                        {
                            id: 'frame-1',
                            name: 'Content',
                            type: 'FRAME',
                            x: 0,
                            y: 0,
                            width: 800,
                            height: 600,
                            children: [
                                {
                                    id: 'text-1',
                                    name: 'Title',
                                    type: 'TEXT',
                                    characters: 'Hello World',
                                    x: 0,
                                    y: 0,
                                    width: 200,
                                    height: 50,
                                    fontName: { family: 'Inter', style: 'Regular' },
                                    fontSize: 24,
                                },
                            ],
                        },
                    ],
                },
            };

            const response = await handlers.onExport(exportMsg);

            expect(response.success).toBe(true);

            // Check vendor JSON was saved
            const vendorJsonPath = path.join(config.devServer.pagesBase, 'home', 'page.figma.json');
            const vendorJsonExists = await fs
                .access(vendorJsonPath)
                .then(() => true)
                .catch(() => false);
            expect(vendorJsonExists).toBe(true);

            // Check jay-html was generated
            const jayHtmlPath = path.join(config.devServer.pagesBase, 'home', 'page.jay-html');
            const jayHtmlExists = await fs
                .access(jayHtmlPath)
                .then(() => true)
                .catch(() => false);
            expect(jayHtmlExists).toBe(true);

            // Read and verify jay-html content
            const jayHtml = await fs.readFile(jayHtmlPath, 'utf-8');
            expect(jayHtml).toContain('<!DOCTYPE html>');
            expect(jayHtml).toContain('Hello World');
            expect(jayHtml).toContain('application/jay-data');
        });

        it('should create page directory if it does not exist', async () => {
            const handlers = createEditorHandlers(config, './tsconfig.json', process.cwd());

            const exportMsg: ExportMessage<FigmaVendorDocument> = {
                type: 'export',
                vendorId: 'figma',
                pageUrl: '/about',
                vendorDoc: {
                    id: 'section-1',
                    name: 'About Page',
                    type: 'SECTION',
                    pluginData: { jpage: 'true', urlRoute: '/about' },
                    children: [
                        {
                            id: 'frame-1',
                            name: 'Content',
                            type: 'FRAME',
                            x: 0,
                            y: 0,
                            width: 800,
                            height: 600,
                            children: [],
                        },
                    ],
                },
            };

            const response = await handlers.onExport(exportMsg);

            expect(response.success).toBe(true);

            const pageDirExists = await fs
                .access(path.join(config.devServer.pagesBase, 'about'))
                .then(() => true)
                .catch(() => false);
            expect(pageDirExists).toBe(true);
        });

        it('should handle parameterized routes', async () => {
            const handlers = createEditorHandlers(config, './tsconfig.json', process.cwd());

            const exportMsg: ExportMessage<FigmaVendorDocument> = {
                type: 'export',
                vendorId: 'figma',
                pageUrl: '/products/:id',
                vendorDoc: {
                    id: 'section-1',
                    name: 'Product Page',
                    type: 'SECTION',
                    pluginData: { jpage: 'true', urlRoute: '/products/:id' },
                    children: [
                        {
                            id: 'frame-1',
                            name: 'Content',
                            type: 'FRAME',
                            x: 0,
                            y: 0,
                            width: 800,
                            height: 600,
                            children: [],
                        },
                    ],
                },
            };

            const response = await handlers.onExport(exportMsg);

            expect(response.success).toBe(true);

            // Should create /products/[id]/ directory
            const pageDirExists = await fs
                .access(path.join(config.devServer.pagesBase, 'products', '[id]'))
                .then(() => true)
                .catch(() => false);
            expect(pageDirExists).toBe(true);
        });
    });

    describe('Import Handler', () => {
        it('should return error when no vendor JSON exists', async () => {
            const handlers = createEditorHandlers(config, './tsconfig.json', process.cwd());

            const importMsg: ImportMessage<FigmaVendorDocument> = {
                type: 'import' as const,
                vendorId: 'figma',
                pageUrl: '/nonexistent',
            };

            const response = await handlers.onImport(importMsg);

            expect(response.success).toBe(false);
            expect(response.error).toBeDefined();
        });
    });

    describe('Font Collection', () => {
        it('should collect and include fonts in generated HTML', async () => {
            const handlers = createEditorHandlers(config, './tsconfig.json', process.cwd());

            const exportMsg: ExportMessage<FigmaVendorDocument> = {
                type: 'export',
                vendorId: 'figma',
                pageUrl: '/fonts-test',
                vendorDoc: {
                    id: 'section-1',
                    name: 'Fonts Test',
                    type: 'SECTION',
                    pluginData: { jpage: 'true', urlRoute: '/fonts-test' },
                    children: [
                        {
                            id: 'frame-1',
                            name: 'Content',
                            type: 'FRAME',
                            x: 0,
                            y: 0,
                            width: 800,
                            height: 600,
                            children: [
                                {
                                    id: 'text-1',
                                    name: 'Title',
                                    type: 'TEXT',
                                    characters: 'Hello',
                                    fontName: { family: 'Roboto', style: 'Regular' },
                                    fontSize: 24,
                                    x: 0,
                                    y: 0,
                                    width: 200,
                                    height: 50,
                                },
                                {
                                    id: 'text-2',
                                    name: 'Subtitle',
                                    type: 'TEXT',
                                    characters: 'World',
                                    fontName: { family: 'Open Sans', style: 'Regular' },
                                    fontSize: 16,
                                    x: 0,
                                    y: 60,
                                    width: 200,
                                    height: 40,
                                },
                            ],
                        },
                    ],
                },
            };

            await handlers.onExport(exportMsg);

            const jayHtmlPath = path.join(
                config.devServer.pagesBase,
                'fonts-test',
                'page.jay-html',
            );
            const jayHtml = await fs.readFile(jayHtmlPath, 'utf-8');

            expect(jayHtml).toContain('fonts.googleapis.com');
            expect(jayHtml).toContain('Roboto');
            expect(jayHtml).toContain('Open+Sans');
        });
    });
});
