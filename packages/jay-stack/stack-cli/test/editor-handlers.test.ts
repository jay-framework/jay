import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createEditorHandlers } from '../lib/editor-handlers';
import type { JayConfig } from '../lib/config';

// Helper function to wrap jayHtml content in valid jay-html structure
function createValidJayHtml(content: string, dataContract: string = 'data:'): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script type="application/jay-data">
${dataContract}
    </script>
</head>
<body>
    ${content}
</body>
</html>`;
}

describe('Editor Handlers', () => {
    const testConfig: Required<JayConfig> = {
        devServer: {
            pagesBase: './tmp-pages',
            componentsBase: './tmp-components',
            publicFolder: './tmp-public',
        },
        editorServer: {
            portRange: [3000, 3010],
            editorId: 'xxx-xxx',
        },
    };
    const TS_CONFIG = './tsconfig.json';

    const testPagesDir = path.resolve('./tmp-pages');
    const testPublicDir = path.resolve('./tmp-public');
    const testComponentsDir = path.resolve('./tmp-components');

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onPublish({
                type: 'publish',
                pages: [
                    {
                        route: '/',
                        jayHtml: createValidJayHtml('<div>Home Page</div>'),
                        name: 'Home',
                    },
                    {
                        route: '/about',
                        jayHtml: createValidJayHtml('<div>About Page</div>'),
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
            expect(fs.readFileSync(homeFile, 'utf-8')).toContain('<div>Home Page</div>');
            expect(fs.readFileSync(aboutFile, 'utf-8')).toContain('<div>About Page</div>');

            // Check that .d.ts files were generated
            const homeDtsFile = path.join(testPagesDir, 'page.jay-html.d.ts');
            const aboutDtsFile = path.join(testPagesDir, 'about', 'page.jay-html.d.ts');

            expect(fs.existsSync(homeDtsFile)).toBe(true);
            expect(fs.existsSync(aboutDtsFile)).toBe(true);

            // Validate .d.ts file structure
            const homeDtsContent = fs.readFileSync(homeDtsFile, 'utf-8');
            expect(homeDtsContent).toContain('export interface');
            expect(homeDtsContent).toContain('export type');
            expect(homeDtsContent).toContain('render(');
        });
    });

    describe('Components Publishing', () => {
        it('should publish components only', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'Button',
                        jayHtml: createValidJayHtml(
                            '<button>{text}</button>',
                            'data:\n  text: string',
                        ),
                    },
                    {
                        name: 'Card',
                        jayHtml: createValidJayHtml(
                            '<div class="card">{content}</div>',
                            'data:\n  content: string',
                        ),
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
            expect(fs.readFileSync(buttonFile, 'utf-8')).toContain('<button>{text}</button>');
            expect(fs.readFileSync(cardFile, 'utf-8')).toContain(
                '<div class="card">{content}</div>',
            );

            // Check that .d.ts files were generated
            const buttonDtsFile = path.join(testComponentsDir, 'Button.jay-html.d.ts');
            const cardDtsFile = path.join(testComponentsDir, 'Card.jay-html.d.ts');

            expect(fs.existsSync(buttonDtsFile)).toBe(true);
            expect(fs.existsSync(cardDtsFile)).toBe(true);

            // Validate .d.ts file structure
            const buttonDtsContent = fs.readFileSync(buttonDtsFile, 'utf-8');
            expect(buttonDtsContent).toContain('text: string');
            expect(buttonDtsContent).toContain('export interface');
            expect(buttonDtsContent).toContain('render(');
        });

        it('should publish pages and components together', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onPublish({
                type: 'publish',
                pages: [
                    {
                        route: '/',
                        jayHtml: createValidJayHtml('<div>Home Page</div>'),
                        name: 'Home',
                    },
                ],
                components: [
                    {
                        name: 'Header',
                        jayHtml: createValidJayHtml(
                            '<header>{title}</header>',
                            'data:\n  title: string',
                        ),
                    },
                    {
                        name: 'Footer',
                        jayHtml: createValidJayHtml(
                            '<footer>{copyright}</footer>',
                            'data:\n  copyright: string',
                        ),
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
            expect(fs.readFileSync(homeFile, 'utf-8')).toContain('<div>Home Page</div>');

            // Check that component files were created
            const headerFile = path.join(testComponentsDir, 'Header.jay-html');
            const footerFile = path.join(testComponentsDir, 'Footer.jay-html');
            expect(fs.existsSync(headerFile)).toBe(true);
            expect(fs.existsSync(footerFile)).toBe(true);
            expect(fs.readFileSync(headerFile, 'utf-8')).toContain('<header>{title}</header>');
            expect(fs.readFileSync(footerFile, 'utf-8')).toContain('<footer>{copyright}</footer>');

            // Check that .d.ts files were generated for all
            const homeDtsFile = path.join(testPagesDir, 'page.jay-html.d.ts');
            const headerDtsFile = path.join(testComponentsDir, 'Header.jay-html.d.ts');
            const footerDtsFile = path.join(testComponentsDir, 'Footer.jay-html.d.ts');

            expect(fs.existsSync(homeDtsFile)).toBe(true);
            expect(fs.existsSync(headerDtsFile)).toBe(true);
            expect(fs.existsSync(footerDtsFile)).toBe(true);
        });

        it('should handle empty components array', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(0);
        });

        it('should handle missing components and pages arrays', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onPublish({
                type: 'publish',
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(0);
        });

        it('should create components directory if it does not exist', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Ensure components directory doesn't exist
            expect(fs.existsSync(testComponentsDir)).toBe(false);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'TestComponent',
                        jayHtml: createValidJayHtml('<div>Test Component</div>'),
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
            expect(fs.readFileSync(componentFile, 'utf-8')).toContain('<div>Test Component</div>');

            // Check that .d.ts file was generated
            const componentDtsFile = path.join(testComponentsDir, 'TestComponent.jay-html.d.ts');
            expect(fs.existsSync(componentDtsFile)).toBe(true);
        });

        it('should handle component names with special characters', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'My-Special_Component123',
                        jayHtml: createValidJayHtml('<div>Special Component</div>'),
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);

            // Check that component file was created with exact name
            const componentFile = path.join(testComponentsDir, 'My-Special_Component123.jay-html');
            expect(fs.existsSync(componentFile)).toBe(true);
            expect(fs.readFileSync(componentFile, 'utf-8')).toContain(
                '<div>Special Component</div>',
            );

            // Check that .d.ts file was generated
            const componentDtsFile = path.join(
                testComponentsDir,
                'My-Special_Component123.jay-html.d.ts',
            );
            expect(fs.existsSync(componentDtsFile)).toBe(true);
        });

        it('should handle large component content', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const largeContent = '<div>' + 'x'.repeat(10000) + '</div>';

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'LargeComponent',
                        jayHtml: createValidJayHtml(largeContent),
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);

            // Check that component file was created with large content
            const componentFile = path.join(testComponentsDir, 'LargeComponent.jay-html');
            expect(fs.existsSync(componentFile)).toBe(true);
            expect(fs.readFileSync(componentFile, 'utf-8')).toContain(largeContent);

            // Check that .d.ts file was generated
            const componentDtsFile = path.join(testComponentsDir, 'LargeComponent.jay-html.d.ts');
            expect(fs.existsSync(componentDtsFile)).toBe(true);
        });

        it('should provide correct file paths in response', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'PathTestComponent',
                        jayHtml: createValidJayHtml('<div>Path Test</div>'),
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);
            expect(result.status[0].filePath).toContain(
                'tmp-components/PathTestComponent.jay-html',
            );
            expect(result.status[0].filePath).toContain(path.resolve('.'));
        });

        it('should generate .d.ts files with proper TypeScript definitions', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        name: 'TypedComponent',
                        jayHtml: createValidJayHtml(
                            '<div><span>{count}</span><button ref="increment">+</button></div>',
                            'data:\n  count: number\n  title: string',
                        ),
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);

            // Check that .d.ts file was generated with proper content
            const componentDtsFile = path.join(testComponentsDir, 'TypedComponent.jay-html.d.ts');
            expect(fs.existsSync(componentDtsFile)).toBe(true);

            const dtsContent = fs.readFileSync(componentDtsFile, 'utf-8');

            // Validate TypeScript definitions
            expect(dtsContent).toContain('export interface');
            expect(dtsContent).toContain('count: number');
            expect(dtsContent).toContain('title: string');
            expect(dtsContent).toContain('export interface');
            expect(dtsContent).toContain('increment:');
            expect(dtsContent).toContain('export type');
            expect(dtsContent).toContain('export declare function render(');
        });
    });

    describe('Image Operations', () => {
        it('should save images correctly', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

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

    describe('Contract Publishing', () => {
        it('should publish pages with contracts correctly', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const contractContent = `name: TestPage
tags:
  - tag: title
    type: data
    dataType: string
    required: true
  - tag: count
    type: data
    dataType: number
    required: true`;

            const result = await handlers.onPublish({
                type: 'publish',
                pages: [
                    {
                        route: '/',
                        jayHtml: createValidJayHtml(
                            '<div>{title}: {count}</div>',
                            'data:\n  title: string\n  count: number',
                        ),
                        name: 'Home',
                        contract: contractContent,
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);
            expect(result.status[0].filePath).toBe(path.join(testPagesDir, 'page.jay-html'));
            expect(result.status[0].contractPath).toBe(
                path.join(testPagesDir, 'page.jay-contract'),
            );

            // Check that both files were created
            expect(fs.existsSync(path.join(testPagesDir, 'page.jay-html'))).toBe(true);
            expect(fs.existsSync(path.join(testPagesDir, 'page.jay-contract'))).toBe(true);

            // Check contract content
            const contractContentRead = fs.readFileSync(
                path.join(testPagesDir, 'page.jay-contract'),
                'utf-8',
            );
            expect(contractContentRead).toBe(contractContent);
        });

        it('should publish components with contracts correctly', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const contractContent = `name: Counter
tags:
  - tag: count
    type: data
    dataType: number
    required: true
  - tag: title
    type: data
    dataType: string
    required: true
  - tag: increment
    type: interactive
    elementType: HTMLButtonElement
    description: Button to increment the counter
  - tag: decrement
    type: interactive
    elementType: HTMLButtonElement
    description: Button to decrement the counter`;

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        jayHtml: createValidJayHtml(
                            '<div><span>{title}: {count}</span><button ref="increment">+</button></div>',
                            'data:\n  count: number\n  title: string',
                        ),
                        name: 'Counter',
                        contract: contractContent,
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(1);
            expect(result.status[0].success).toBe(true);
            expect(result.status[0].filePath).toBe(
                path.join(testComponentsDir, 'Counter.jay-html'),
            );
            expect(result.status[0].contractPath).toBe(
                path.join(testComponentsDir, 'Counter.jay-contract'),
            );

            // Check that both files were created
            expect(fs.existsSync(path.join(testComponentsDir, 'Counter.jay-html'))).toBe(true);
            expect(fs.existsSync(path.join(testComponentsDir, 'Counter.jay-contract'))).toBe(true);

            // Check contract content
            const contractContentRead = fs.readFileSync(
                path.join(testComponentsDir, 'Counter.jay-contract'),
                'utf-8',
            );
            expect(contractContentRead).toBe(contractContent);
        });

        it('should publish without contracts when not provided', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onPublish({
                type: 'publish',
                pages: [
                    {
                        route: '/no-contract',
                        jayHtml: createValidJayHtml('<div>No contract page</div>'),
                        name: 'NoContract',
                        // No contract provided
                    },
                ],
                components: [
                    {
                        jayHtml: createValidJayHtml('<div>No contract component</div>'),
                        name: 'NoContractComponent',
                        // No contract provided
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(2);

            // Page result
            expect(result.status[0].success).toBe(true);
            expect(result.status[0].filePath).toBe(
                path.join(testPagesDir, 'no-contract', 'page.jay-html'),
            );
            expect(result.status[0].contractPath).toBeUndefined();

            // Component result
            expect(result.status[1].success).toBe(true);
            expect(result.status[1].filePath).toBe(
                path.join(testComponentsDir, 'NoContractComponent.jay-html'),
            );
            expect(result.status[1].contractPath).toBeUndefined();

            // Check that only jay-html files were created
            expect(fs.existsSync(path.join(testPagesDir, 'no-contract', 'page.jay-html'))).toBe(
                true,
            );
            expect(fs.existsSync(path.join(testPagesDir, 'no-contract', 'page.jay-contract'))).toBe(
                false,
            );
            expect(
                fs.existsSync(path.join(testComponentsDir, 'NoContractComponent.jay-html')),
            ).toBe(true);
            expect(
                fs.existsSync(path.join(testComponentsDir, 'NoContractComponent.jay-contract')),
            ).toBe(false);
        });

        it('should handle mixed publishing (some with contracts, some without)', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const contractContent = `name: WithContract
tags:
  - tag: message
    type: data
    dataType: string
    required: true`;

            const result = await handlers.onPublish({
                type: 'publish',
                components: [
                    {
                        jayHtml: createValidJayHtml(
                            '<div>{message}</div>',
                            'data:\n  message: string',
                        ),
                        name: 'WithContract',
                        contract: contractContent,
                    },
                    {
                        jayHtml: createValidJayHtml('<div>No contract</div>'),
                        name: 'WithoutContract',
                        // No contract
                    },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(2);

            // First component with contract
            expect(result.status[0].success).toBe(true);
            expect(result.status[0].contractPath).toBe(
                path.join(testComponentsDir, 'WithContract.jay-contract'),
            );

            // Second component without contract
            expect(result.status[1].success).toBe(true);
            expect(result.status[1].contractPath).toBeUndefined();

            // Check files
            expect(fs.existsSync(path.join(testComponentsDir, 'WithContract.jay-html'))).toBe(true);
            expect(fs.existsSync(path.join(testComponentsDir, 'WithContract.jay-contract'))).toBe(
                true,
            );
            expect(fs.existsSync(path.join(testComponentsDir, 'WithoutContract.jay-html'))).toBe(
                true,
            );
            expect(
                fs.existsSync(path.join(testComponentsDir, 'WithoutContract.jay-contract')),
            ).toBe(false);
        });
    });
});
