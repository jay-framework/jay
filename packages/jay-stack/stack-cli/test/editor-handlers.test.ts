import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createEditorHandlers } from '../lib/editor-handlers';
import type { JayConfig } from '../lib/config';

describe('Editor Handlers', () => {
    const testConfig: JayConfig = {
        devServer: {
            pagesBase: './test-pages',
            componentsBase: './test-components',
            publicFolder: './test-public',
        },
    };

    const testPagesDir = path.resolve('./test-pages');
    const testPublicDir = path.resolve('./test-public');
    const testComponentsDir = path.resolve('./test-components');

    beforeEach(() => {
        // Clean up test directories
        if (fs.existsSync(testPagesDir)) {
            fs.rmSync(testPagesDir, { recursive: true, force: true });
        }
        if (fs.existsSync(testPublicDir)) {
            fs.rmSync(testPublicDir, { recursive: true, force: true });
        }
        if (fs.existsSync(testComponentsDir)) {
            fs.rmSync(testComponentsDir, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        // Clean up test directories
        if (fs.existsSync(testPagesDir)) {
            fs.rmSync(testPagesDir, { recursive: true, force: true });
        }
        if (fs.existsSync(testPublicDir)) {
            fs.rmSync(testPublicDir, { recursive: true, force: true });
        }
        if (fs.existsSync(testComponentsDir)) {
            fs.rmSync(testComponentsDir, { recursive: true, force: true });
        }
    });

    describe('Pages Publishing', () => {
        it('should publish pages correctly', async () => {
            const handlers = createEditorHandlers(testConfig);

            const result = await handlers.onPublish({
                type: 'publish',
                pages: [
                    {
                        route: '/',
                        jayHtml: '<div>Home Page</div>',
                        name: 'Home',
                    },
                    {
                        route: '/about',
                        jayHtml: '<div>About Page</div>',
                        name: 'About',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(2);
            expect(result.status[0].success).toBe(true);
            expect(result.status[1].success).toBe(true);

            // Check that files were created
            const homeFile = path.join(testPagesDir, 'page.jay-html');
            const aboutFile = path.join(testPagesDir, 'about', 'page.jay-html');

            expect(fs.existsSync(homeFile)).toBe(true);
            expect(fs.existsSync(aboutFile)).toBe(true);
            expect(fs.readFileSync(homeFile, 'utf-8')).toBe('<div>Home Page</div>');
            expect(fs.readFileSync(aboutFile, 'utf-8')).toBe('<div>About Page</div>');
        });
    });

    describe('Components Publishing', () => {
        it('should publish components only', async () => {
            const handlers = createEditorHandlers(testConfig);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'Button',
                        jayHtml: '<button>{{text}}</button>',
                    },
                    {
                        name: 'Card',
                        jayHtml: '<div class="card">{{content}}</div>',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(2);
            expect(result.status[0].success).toBe(true);
            expect(result.status[1].success).toBe(true);

            // Check that component files were created in correct directory
            const buttonFile = path.join(testComponentsDir, 'Button.jay-html');
            const cardFile = path.join(testComponentsDir, 'Card.jay-html');

            expect(fs.existsSync(buttonFile)).toBe(true);
            expect(fs.existsSync(cardFile)).toBe(true);
            expect(fs.readFileSync(buttonFile, 'utf-8')).toBe('<button>{{text}}</button>');
            expect(fs.readFileSync(cardFile, 'utf-8')).toBe('<div class="card">{{content}}</div>');
        });

        it('should publish pages and components together', async () => {
            const handlers = createEditorHandlers(testConfig);

            const result = await handlers.onPublish({
                type: 'publish',
                pages: [
                    {
                        route: '/',
                        jayHtml: '<div>Home Page</div>',
                        name: 'Home',
                    },
                ],
                components: [
                    {
                        name: 'Header',
                        jayHtml: '<header>{{title}}</header>',
                    },
                    {
                        name: 'Footer',
                        jayHtml: '<footer>{{copyright}}</footer>',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(3); // 1 page + 2 components
            expect(result.status[0].success).toBe(true);
            expect(result.status[1].success).toBe(true);
            expect(result.status[2].success).toBe(true);

            // Check that page file was created
            const homeFile = path.join(testPagesDir, 'page.jay-html');
            expect(fs.existsSync(homeFile)).toBe(true);
            expect(fs.readFileSync(homeFile, 'utf-8')).toBe('<div>Home Page</div>');

            // Check that component files were created
            const headerFile = path.join(testComponentsDir, 'Header.jay-html');
            const footerFile = path.join(testComponentsDir, 'Footer.jay-html');
            expect(fs.existsSync(headerFile)).toBe(true);
            expect(fs.existsSync(footerFile)).toBe(true);
            expect(fs.readFileSync(headerFile, 'utf-8')).toBe('<header>{{title}}</header>');
            expect(fs.readFileSync(footerFile, 'utf-8')).toBe('<footer>{{copyright}}</footer>');
        });

        it('should handle empty components array', async () => {
            const handlers = createEditorHandlers(testConfig);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(0);
        });

        it('should handle missing components and pages arrays', async () => {
            const handlers = createEditorHandlers(testConfig);

            const result = await handlers.onPublish({
                type: 'publish',
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(0);
        });

        it('should create components directory if it does not exist', async () => {
            const handlers = createEditorHandlers(testConfig);

            // Ensure components directory doesn't exist
            expect(fs.existsSync(testComponentsDir)).toBe(false);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'TestComponent',
                        jayHtml: '<div>Test Component</div>',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);

            // Check that directory was created
            expect(fs.existsSync(testComponentsDir)).toBe(true);
            
            // Check that component file was created
            const componentFile = path.join(testComponentsDir, 'TestComponent.jay-html');
            expect(fs.existsSync(componentFile)).toBe(true);
            expect(fs.readFileSync(componentFile, 'utf-8')).toBe('<div>Test Component</div>');
        });

        it('should handle component names with special characters', async () => {
            const handlers = createEditorHandlers(testConfig);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'My-Special_Component123',
                        jayHtml: '<div>Special Component</div>',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);

            // Check that component file was created with exact name
            const componentFile = path.join(testComponentsDir, 'My-Special_Component123.jay-html');
            expect(fs.existsSync(componentFile)).toBe(true);
            expect(fs.readFileSync(componentFile, 'utf-8')).toBe('<div>Special Component</div>');
        });

        it('should handle large component content', async () => {
            const handlers = createEditorHandlers(testConfig);

            const largeContent = '<div>' + 'x'.repeat(10000) + '</div>';
            
            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'LargeComponent',
                        jayHtml: largeContent,
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);

            // Check that component file was created with large content
            const componentFile = path.join(testComponentsDir, 'LargeComponent.jay-html');
            expect(fs.existsSync(componentFile)).toBe(true);
            expect(fs.readFileSync(componentFile, 'utf-8')).toBe(largeContent);
        });

        it('should provide correct file paths in response', async () => {
            const handlers = createEditorHandlers(testConfig);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'PathTestComponent',
                        jayHtml: '<div>Path Test</div>',
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);
            expect(result.status[0].filePath).toContain('test-components/PathTestComponent.jay-html');
            expect(result.status[0].filePath).toContain(path.resolve('.'));
        });
    });

    describe('Image Operations', () => {
        it('should save images correctly', async () => {
            const handlers = createEditorHandlers(testConfig);

            const imageData = Buffer.from('fake-image-data').toString('base64');
            const result = await handlers.onSaveImage({
                type: 'saveImage',
                imageId: 'test-image',
                imageData,
            });

            expect(result.success).toBe(true);
            expect(result.imageUrl).toBe('/images/test-image.png');

            // Check that image was saved
            const imagePath = path.join(testPublicDir, 'images', 'test-image.png');
            expect(fs.existsSync(imagePath)).toBe(true);
        });

        it('should check image existence correctly', async () => {
            const handlers = createEditorHandlers(testConfig);

            // Create test image
            const imagesDir = path.join(testPublicDir, 'images');
            fs.mkdirSync(imagesDir, { recursive: true });
            fs.writeFileSync(path.join(imagesDir, 'test-image.png'), 'fake-data');

            const result = await handlers.onHasImage({
                type: 'hasImage',
                imageId: 'test-image',
            });

            expect(result.success).toBe(true);
            expect(result.exists).toBe(true);
            expect(result.imageUrl).toBe('/images/test-image.png');

            // Check non-existent image
            const result2 = await handlers.onHasImage({
                type: 'hasImage',
                imageId: 'non-existent',
            });

            expect(result2.success).toBe(true);
            expect(result2.exists).toBe(false);
            expect(result2.imageUrl).toBeUndefined();
        });
    });
});
