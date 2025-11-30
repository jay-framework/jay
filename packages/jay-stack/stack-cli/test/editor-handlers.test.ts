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
            portRange: [3000, 3010],
            pagesBase: './tmp-pages',
            componentsBase: './tmp-components',
            publicFolder: './tmp-public',
            configBase: './tmp-config',
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

    describe('GetContracts API', () => {
        const configDir = path.resolve('./tmp-config');
        const installedAppsDir = path.join(configDir, 'installedApps');

        beforeEach(() => {
            // Clean up config directory
            if (fs.existsSync(configDir)) {
                fs.rmSync(configDir, { recursive: true, force: true });
            }
        });

        afterEach(() => {
            // Clean up config directory
            if (fs.existsSync(configDir)) {
                fs.rmSync(configDir, { recursive: true, force: true });
            }
        });

        it('should return empty arrays when no pages or installed apps exist', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            expect(result.info.pages).toEqual([]);
            expect(result.info.installedAppContracts).toEqual({});
        });

        it('should return pages without contracts', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Create pages without contracts
            fs.mkdirSync(testPagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-html'),
                createValidJayHtml('<div>Home</div>'),
            );

            fs.mkdirSync(path.join(testPagesDir, 'about'), { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'about', 'page.jay-html'),
                createValidJayHtml('<div>About</div>'),
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            expect(result.info.pages).toHaveLength(2);

            const homePage = result.info.pages.find((p) => p.url === '/');
            expect(homePage).toBeDefined();
            expect(homePage.name).toBe('Home');
            expect(homePage.contractSchema).toBeUndefined();
            expect(homePage.usedComponents).toEqual([]);

            const aboutPage = result.info.pages.find((p) => p.url === '/about');
            expect(aboutPage).toBeDefined();
            expect(aboutPage.name).toBe('about');
            expect(aboutPage.contractSchema).toBeUndefined();
            expect(aboutPage.usedComponents).toEqual([]);
        });

        it('should return pages with their own contracts', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Create pages with contracts
            fs.mkdirSync(testPagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-html'),
                createValidJayHtml('<div>{siteTitle}</div>', 'data:\n  siteTitle: string'),
            );
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-contract'),
                `name: home
tags:
  - tag: siteTitle
    type: data
    dataType: string
  - tag: address
    type: data
    dataType: string`,
            );

            fs.mkdirSync(path.join(testPagesDir, 'products'), { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'products', 'page.jay-html'),
                createValidJayHtml('<div>{productList}</div>'),
            );
            fs.writeFileSync(
                path.join(testPagesDir, 'products', 'page.jay-contract'),
                `name: products
tags:
  - tag: productList
    type: sub-contract
    repeated: true
    tags:
      - tag: name
        type: data
        dataType: string
      - tag: price
        type: data
        dataType: number`,
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            expect(result.info.pages).toHaveLength(2);

            // Check home page
            const homePage = result.info.pages.find((p) => p.url === '/');
            expect(homePage).toBeDefined();
            expect(homePage.contractSchema).toBeDefined();
            expect(homePage.contractSchema.name).toBe('home');
            expect(homePage.contractSchema.tags).toHaveLength(2);
            expect(homePage.contractSchema.tags[0].tag).toBe('siteTitle');
            expect(homePage.contractSchema.tags[0].type).toBe('data');
            expect(homePage.contractSchema.tags[0].dataType).toBe('string');
            expect(homePage.contractSchema.tags[1].tag).toBe('address');
            expect(homePage.contractSchema.tags[1].type).toBe('data');
            expect(homePage.contractSchema.tags[1].dataType).toBe('string');

            // Check products page
            const productsPage = result.info.pages.find((p) => p.url === '/products');
            expect(productsPage).toBeDefined();
            expect(productsPage.contractSchema).toBeDefined();
            expect(productsPage.contractSchema.name).toBe('products');
            expect(productsPage.contractSchema.tags).toHaveLength(1);
            expect(productsPage.contractSchema.tags[0].tag).toBe('productList');
            expect(productsPage.contractSchema.tags[0].type).toBe('subContract');
            expect(productsPage.contractSchema.tags[0].repeated).toBe(true);
            expect(productsPage.contractSchema.tags[0].tags).toHaveLength(2);
            expect(productsPage.contractSchema.tags[0].tags[0].tag).toBe('name');
            expect(productsPage.contractSchema.tags[0].tags[0].type).toBe('data');
            expect(productsPage.contractSchema.tags[0].tags[0].dataType).toBe('string');
            expect(productsPage.contractSchema.tags[0].tags[1].tag).toBe('price');
            expect(productsPage.contractSchema.tags[0].tags[1].type).toBe('data');
            expect(productsPage.contractSchema.tags[0].tags[1].dataType).toBe('number');
        });

        it('should return pages with used component contracts (references only)', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Create page that uses an installed app component
            fs.mkdirSync(testPagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-html'),
                `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless"
            contract="test-app/product-page.jay-contract"
            src="test-app"
            name="productPage"
            key="pp"
    ></script>
</head>
<body>
    <div>{pp.title}</div>
</body>
</html>`,
            );

            // Create installed app configuration
            const testAppDir = path.join(installedAppsDir, 'test-app');
            fs.mkdirSync(testAppDir, { recursive: true });
            fs.writeFileSync(
                path.join(testAppDir, 'app.conf.yaml'),
                `name: test-app
module: test-app
pages:
  - name: productPage
    headless_components:
      - name: productPage
        key: pp
        contract: product-page.jay-contract`,
            );

            // Create the app contract file in node_modules
            const nodeModulesAppDir = path.join(process.cwd(), 'node_modules', 'test-app');
            fs.mkdirSync(nodeModulesAppDir, { recursive: true });
            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'product-page.jay-contract'),
                `name: product-page
tags:
  - tag: title
    type: data
    dataType: string`,
            );

            // Also create package.json so require.resolve works
            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'package.json'),
                JSON.stringify({ name: 'test-app', version: '1.0.0' }),
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            expect(result.info.pages).toHaveLength(1);

            const homePage = result.info.pages[0];
            expect(homePage.url).toBe('/');
            expect(homePage.usedComponents).toHaveLength(1);
            expect(homePage.usedComponents[0]).toMatchObject({
                appName: 'test-app',
                componentName: 'productPage',
            });

            // Verify full contract is in installedAppContracts
            expect(result.info.installedAppContracts['test-app']).toBeDefined();
            expect(result.info.installedAppContracts['test-app'].pages).toHaveLength(1);
            expect(result.info.installedAppContracts['test-app'].pages[0].pageName).toBe(
                'productPage',
            );
            expect(result.info.installedAppContracts['test-app'].pages[0].contractSchema.name).toBe(
                'product-page',
            );

            // Clean up
            fs.rmSync(nodeModulesAppDir, { recursive: true, force: true });
        });

        it('should return complete installed app contracts', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Create installed app configuration
            const testAppDir = path.join(installedAppsDir, 'shop-app');
            fs.mkdirSync(testAppDir, { recursive: true });
            fs.writeFileSync(
                path.join(testAppDir, 'app.conf.yaml'),
                `name: shop-app
module: shop-app
pages:
  - name: productPage
    headless_components:
      - name: productPage
        key: pp
        contract: product.jay-contract
  - name: categoryPage
    headless_components:
      - name: categoryPage
        key: cp
        contract: category.jay-contract
components:
  - name: cartDrawer
    headless_components:
      - name: cartDrawer
        key: cd
        contract: cart.jay-contract`,
            );

            // Create the app contract files in node_modules
            const nodeModulesAppDir = path.join(process.cwd(), 'node_modules', 'shop-app');
            fs.mkdirSync(nodeModulesAppDir, { recursive: true });

            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'product.jay-contract'),
                `name: product
tags:
  - tag: title
    type: data
    dataType: string
  - tag: price
    type: data
    dataType: number`,
            );

            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'category.jay-contract'),
                `name: category
tags:
  - tag: categoryName
    type: data
    dataType: string
    required: true
  - tag: products
    type: sub-contract
    repeated: true
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: name
        type: data
        dataType: string`,
            );

            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'cart.jay-contract'),
                `name: cart
tags:
  - tag: items
    type: sub-contract
    repeated: true
    tags:
      - tag: productId
        type: data
        dataType: string
      - tag: quantity
        type: data
        dataType: number
  - tag: total
    type: data
    dataType: number`,
            );

            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'package.json'),
                JSON.stringify({ name: 'shop-app', version: '1.0.0' }),
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            expect(result.info.installedAppContracts['shop-app']).toBeDefined();

            const shopApp = result.info.installedAppContracts['shop-app'];
            expect(shopApp.appName).toBe('shop-app');
            expect(shopApp.module).toBe('shop-app');
            expect(shopApp.pages).toHaveLength(2);
            expect(shopApp.components).toHaveLength(1);

            // Check product page contract
            const productPage = shopApp.pages.find((p) => p.pageName === 'productPage');
            expect(productPage).toBeDefined();
            expect(productPage.contractSchema.name).toBe('product');
            expect(productPage.contractSchema.tags).toHaveLength(2);

            // Check category page contract
            const categoryPage = shopApp.pages.find((p) => p.pageName === 'categoryPage');
            expect(categoryPage).toBeDefined();
            expect(categoryPage.contractSchema.name).toBe('category');
            expect(categoryPage.contractSchema.tags).toHaveLength(2);
            expect(categoryPage.contractSchema.tags[1].type).toBe('subContract');
            expect(categoryPage.contractSchema.tags[1].repeated).toBe(true);

            // Check cart component contract
            expect(shopApp.components[0].componentName).toBe('cartDrawer');
            expect(shopApp.components[0].contractSchema.name).toBe('cart');
            expect(shopApp.components[0].contractSchema.tags).toHaveLength(2);

            // Clean up
            fs.rmSync(nodeModulesAppDir, { recursive: true, force: true });
        });

        it('should handle parameterized routes correctly', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Create parameterized route
            fs.mkdirSync(path.join(testPagesDir, 'products', '[productId]'), { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'products', '[productId]', 'page.jay-html'),
                createValidJayHtml('<div>Product Details</div>'),
            );
            fs.writeFileSync(
                path.join(testPagesDir, 'products', '[productId]', 'page.jay-contract'),
                `name: product-detail
tags:
  - tag: productId
    type: data
    dataType: string`,
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            const productPage = result.info.pages.find((p) => p.url === '/products/:productId');
            expect(productPage).toBeDefined();
            expect(productPage.name).toBe('[productId]');
            expect(productPage.contractSchema).toBeDefined();
            expect(productPage.contractSchema.tags[0].tag).toBe('productId');
        });

        it('should handle nested parameterized routes', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Create nested parameterized routes
            fs.mkdirSync(
                path.join(testPagesDir, 'categories', '[categoryId]', 'products', '[productId]'),
                { recursive: true },
            );
            fs.writeFileSync(
                path.join(
                    testPagesDir,
                    'categories',
                    '[categoryId]',
                    'products',
                    '[productId]',
                    'page.jay-html',
                ),
                createValidJayHtml('<div>Nested Product</div>'),
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            const nestedPage = result.info.pages.find(
                (p) => p.url === '/categories/:categoryId/products/:productId',
            );
            expect(nestedPage).toBeDefined();
            expect(nestedPage.name).toBe('[productId]');
        });

        it('should handle pages with linked sub-contracts', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Create product sub-contract
            fs.mkdirSync(testPagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'product.jay-contract'),
                `name: product
tags:
  - tag: title
    type: data
    dataType: string
  - tag: description
    type: data
    dataType: string`,
            );

            // Create page contract that links to product
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-html'),
                createValidJayHtml('<div>Home</div>'),
            );
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-contract'),
                `name: home
tags:
  - tag: siteTitle
    type: data
    dataType: string
  - tag: featured
    type: sub-contract
    link: ./product.jay-contract`,
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            const homePage = result.info.pages[0];
            expect(homePage.contractSchema).toBeDefined();
            expect(homePage.contractSchema.tags).toHaveLength(2);

            // Check that the linked sub-contract was resolved
            const featuredTag = homePage.contractSchema.tags[1];
            expect(featuredTag.tag).toBe('featured');
            expect(featuredTag.type).toBe('subContract');
            expect(featuredTag.tags).toBeDefined();
            expect(featuredTag.tags).toHaveLength(2);
            expect(featuredTag.tags[0].tag).toBe('title');
            expect(featuredTag.tags[1].tag).toBe('description');
        });

        it('should handle multiple pages using the same app component', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Create two pages that use the same app component
            fs.mkdirSync(testPagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-html'),
                `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless"
            contract="test-app/analytics.jay-contract"
            src="test-app"
            name="analytics"
            key="an"
    ></script>
</head>
<body><div>Home</div></body>
</html>`,
            );

            fs.mkdirSync(path.join(testPagesDir, 'about'), { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'about', 'page.jay-html'),
                `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless"
            contract="test-app/analytics.jay-contract"
            src="test-app"
            name="analytics"
            key="an"
    ></script>
</head>
<body><div>About</div></body>
</html>`,
            );

            // Create installed app
            const testAppDir = path.join(installedAppsDir, 'test-app');
            fs.mkdirSync(testAppDir, { recursive: true });
            fs.writeFileSync(
                path.join(testAppDir, 'app.conf.yaml'),
                `name: test-app
module: test-app
components:
  - name: analytics
    headless_components:
      - name: analytics
        key: an
        contract: analytics.jay-contract`,
            );

            const nodeModulesAppDir = path.join(process.cwd(), 'node_modules', 'test-app');
            fs.mkdirSync(nodeModulesAppDir, { recursive: true });
            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'analytics.jay-contract'),
                `name: analytics
tags:
  - tag: viewCount
    type: data
    dataType: number`,
            );
            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'package.json'),
                JSON.stringify({ name: 'test-app', version: '1.0.0' }),
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            expect(result.info.pages).toHaveLength(2);

            // Both pages should reference the same component
            expect(result.info.pages[0].usedComponents).toHaveLength(1);
            expect(result.info.pages[0].usedComponents[0]).toMatchObject({
                appName: 'test-app',
                componentName: 'analytics',
            });

            expect(result.info.pages[1].usedComponents).toHaveLength(1);
            expect(result.info.pages[1].usedComponents[0]).toMatchObject({
                appName: 'test-app',
                componentName: 'analytics',
            });

            // Contract should only exist once in installedAppContracts
            expect(result.info.installedAppContracts['test-app'].components).toHaveLength(1);
            expect(result.info.installedAppContracts['test-app'].components[0].componentName).toBe(
                'analytics',
            );

            // Clean up
            fs.rmSync(nodeModulesAppDir, { recursive: true, force: true });
        });

        it('should handle complex scenario with page contracts and multiple app components', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG);

            // Create page with its own contract and using multiple app components
            fs.mkdirSync(testPagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-html'),
                `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless"
            contract="shop-app/product.jay-contract"
            src="shop-app"
            name="productPage"
            key="pp"
    ></script>
    <script type="application/jay-headless"
            contract="analytics-app/tracker.jay-contract"
            src="analytics-app"
            name="tracker"
            key="tr"
    ></script>
</head>
<body><div>{siteTitle} {pp.title} {tr.views}</div></body>
</html>`,
            );
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-contract'),
                `name: home
tags:
  - tag: siteTitle
    type: data
    dataType: string
  - tag: description
    type: data
    dataType: string`,
            );

            // Create shop-app
            const shopAppDir = path.join(installedAppsDir, 'shop-app');
            fs.mkdirSync(shopAppDir, { recursive: true });
            fs.writeFileSync(
                path.join(shopAppDir, 'app.conf.yaml'),
                `name: shop-app
module: shop-app
pages:
  - name: productPage
    headless_components:
      - name: productPage
        key: pp
        contract: product.jay-contract`,
            );

            const shopNodeModules = path.join(process.cwd(), 'node_modules', 'shop-app');
            fs.mkdirSync(shopNodeModules, { recursive: true });
            fs.writeFileSync(
                path.join(shopNodeModules, 'product.jay-contract'),
                `name: product
tags:
  - tag: title
    type: data
    dataType: string
  - tag: price
    type: data
    dataType: number`,
            );
            fs.writeFileSync(
                path.join(shopNodeModules, 'package.json'),
                JSON.stringify({ name: 'shop-app', version: '1.0.0' }),
            );

            // Create analytics-app
            const analyticsAppDir = path.join(installedAppsDir, 'analytics-app');
            fs.mkdirSync(analyticsAppDir, { recursive: true });
            fs.writeFileSync(
                path.join(analyticsAppDir, 'app.conf.yaml'),
                `name: analytics-app
module: analytics-app
components:
  - name: tracker
    headless_components:
      - name: tracker
        key: tr
        contract: tracker.jay-contract`,
            );

            const analyticsNodeModules = path.join(process.cwd(), 'node_modules', 'analytics-app');
            fs.mkdirSync(analyticsNodeModules, { recursive: true });
            fs.writeFileSync(
                path.join(analyticsNodeModules, 'tracker.jay-contract'),
                `name: tracker
tags:
  - tag: views
    type: data
    dataType: number
  - tag: lastViewed
    type: data
    dataType: string`,
            );
            fs.writeFileSync(
                path.join(analyticsNodeModules, 'package.json'),
                JSON.stringify({ name: 'analytics-app', version: '1.0.0' }),
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            expect(result.info.pages).toHaveLength(1);

            const homePage = result.info.pages[0];

            // Check page's own contract
            expect(homePage.contractSchema).toBeDefined();
            expect(homePage.contractSchema.name).toBe('home');
            expect(homePage.contractSchema.tags).toHaveLength(2);
            expect(homePage.contractSchema.tags[0].tag).toBe('siteTitle');
            expect(homePage.contractSchema.tags[1].tag).toBe('description');

            // Check used component references
            expect(homePage.usedComponents).toHaveLength(2);
            expect(homePage.usedComponents).toContainEqual(
                expect.objectContaining({
                    appName: 'shop-app',
                    componentName: 'productPage',
                }),
            );
            expect(homePage.usedComponents).toContainEqual(
                expect.objectContaining({
                    appName: 'analytics-app',
                    componentName: 'tracker',
                }),
            );

            // Check installed app contracts
            expect(Object.keys(result.info.installedAppContracts)).toHaveLength(2);
            expect(result.info.installedAppContracts['shop-app']).toBeDefined();
            expect(result.info.installedAppContracts['analytics-app']).toBeDefined();

            // Verify full contracts are available
            const shopProduct = result.info.installedAppContracts['shop-app'].pages.find(
                (p) => p.pageName === 'productPage',
            );
            expect(shopProduct.contractSchema.tags).toHaveLength(2);

            const analyticsTracker = result.info.installedAppContracts[
                'analytics-app'
            ].components.find((c) => c.componentName === 'tracker');
            expect(analyticsTracker.contractSchema.tags).toHaveLength(2);

            // Clean up
            fs.rmSync(shopNodeModules, { recursive: true, force: true });
            fs.rmSync(analyticsNodeModules, { recursive: true, force: true });
        });
    });
});
