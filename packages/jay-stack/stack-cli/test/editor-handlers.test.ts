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

        // Clean up test plugin directories in node_modules
        const testNodeModules = ['test-app', 'shop-app', 'analytics-app'];
        for (const moduleName of testNodeModules) {
            const moduleDir = path.join(process.cwd(), 'node_modules', moduleName);
            if (fs.existsSync(moduleDir)) {
                fs.rmSync(moduleDir, { recursive: true, force: true });
            }
        }

        // Clean up test package.json
        const testPackageJson = path.join(process.cwd(), 'package.json.test-backup');
        if (fs.existsSync(testPackageJson)) {
            fs.unlinkSync(testPackageJson);
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

        // Clean up test plugin directories in node_modules
        const testNodeModules = ['test-app', 'shop-app', 'analytics-app'];
        for (const moduleName of testNodeModules) {
            const moduleDir = path.join(process.cwd(), 'node_modules', moduleName);
            if (fs.existsSync(moduleDir)) {
                fs.rmSync(moduleDir, { recursive: true, force: true });
            }
        }

        // Restore original package.json if we backed it up
        const testPackageJson = path.join(process.cwd(), 'package.json.test-backup');
        const originalPackageJson = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(testPackageJson)) {
            fs.renameSync(testPackageJson, originalPackageJson);
        }
    });

    // Helper function to create a test package.json with mock plugin dependencies
    function createTestPackageJson(pluginNames: string[]) {
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const backupPath = path.join(process.cwd(), 'package.json.test-backup');

        // Backup original package.json
        if (fs.existsSync(packageJsonPath)) {
            fs.renameSync(packageJsonPath, backupPath);
        }

        // Create test package.json with plugin dependencies
        const testPackageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {},
        };

        // Add each plugin as a dependency
        for (const pluginName of pluginNames) {
            testPackageJson.dependencies[pluginName] = '1.0.0';
        }

        fs.writeFileSync(packageJsonPath, JSON.stringify(testPackageJson, null, 2));
    }

    describe('Pages Publishing', () => {
        it('should publish pages correctly', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

            const result = await handlers.onPublish({
                type: 'publish',
                components: [],
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(0);
        });

        it('should handle missing components and pages arrays', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

            const result = await handlers.onPublish({
                type: 'publish',
            });

            expect(result.success).toBe(true);
            expect(result.status).toHaveLength(0);
        });

        it('should create components directory if it does not exist', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            expect(result.info.pages).toEqual([]);
        });

        it('should return pages without contracts', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            expect(homePage.contract).toBeUndefined();
            expect(homePage.usedComponents).toEqual([]);

            const aboutPage = result.info.pages.find((p) => p.url === '/about');
            expect(aboutPage).toBeDefined();
            expect(aboutPage.name).toBe('about');
            expect(aboutPage.contract).toBeUndefined();
            expect(aboutPage.usedComponents).toEqual([]);
        });

        it('should return pages with their own contracts', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
    trackBy: name
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
            expect(homePage.contract).toBeDefined();
            expect(homePage.contract.name).toBe('home');
            expect(homePage.contract.tags).toHaveLength(2);
            expect(homePage.contract.tags[0].tag).toBe('siteTitle');
            expect(homePage.contract.tags[0].type).toBe('data');
            expect(homePage.contract.tags[0].dataType).toBe('string');
            expect(homePage.contract.tags[1].tag).toBe('address');
            expect(homePage.contract.tags[1].type).toBe('data');
            expect(homePage.contract.tags[1].dataType).toBe('string');

            // Check products page
            const productsPage = result.info.pages.find((p) => p.url === '/products');
            expect(productsPage).toBeDefined();
            expect(productsPage.contract).toBeDefined();
            expect(productsPage.contract.name).toBe('products');
            expect(productsPage.contract.tags).toHaveLength(1);
            expect(productsPage.contract.tags[0].tag).toBe('productList');
            expect(productsPage.contract.tags[0].type).toBe('subContract');
            expect(productsPage.contract.tags[0].repeated).toBe(true);
            expect(productsPage.contract.tags[0].tags).toHaveLength(2);
            expect(productsPage.contract.tags[0].tags[0].tag).toBe('name');
            expect(productsPage.contract.tags[0].tags[0].type).toBe('data');
            expect(productsPage.contract.tags[0].tags[0].dataType).toBe('string');
            expect(productsPage.contract.tags[0].tags[1].tag).toBe('price');
            expect(productsPage.contract.tags[0].tags[1].type).toBe('data');
            expect(productsPage.contract.tags[0].tags[1].dataType).toBe('number');
        });

        it('should return pages with used component contracts (references only)', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

            // Create test package.json with plugin dependency
            createTestPackageJson(['test-app']);

            // Create page that uses an installed app component
            fs.mkdirSync(testPagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-html'),
                `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-data">
        data:
    </script>
    <script type="application/jay-headless"
            plugin="test-app"
            contract="product-page"
            key="pp"
    ></script>
</head>
<body>
    <div>{pp.title}</div>
</body>
</html>`,
            );

            // No need for installed app configuration - using plugin system instead

            // Create the app contract file in node_modules
            const nodeModulesAppDir = path.join(process.cwd(), 'node_modules', 'test-app');
            fs.mkdirSync(nodeModulesAppDir, { recursive: true });

            // Create plugin.yaml for the plugin system
            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'plugin.yaml'),
                `name: test-app
module: test-app
contracts:
  - name: product-page
    contract: product-page.jay-contract
    component: productPage`,
            );

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
                JSON.stringify({
                    name: 'test-app',
                    version: '1.0.0',
                    exports: {
                        '.': './index.js',
                        './plugin.yaml': './plugin.yaml',
                        './product-page.jay-contract': './product-page.jay-contract',
                    },
                }),
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
                componentName: 'product-page',
            });

            // Clean up
            fs.rmSync(nodeModulesAppDir, { recursive: true, force: true });
        });

        it('should resolve local plugins from src/plugins/ for headless imports', async () => {
            const localTestDir = path.resolve('./tmp-local-plugin-test');
            const localPagesDir = path.join(localTestDir, 'pages');

            try {
                fs.mkdirSync(localPagesDir, { recursive: true });

                const localPluginDir = path.join(localTestDir, 'src', 'plugins', 'product-data');
                fs.mkdirSync(localPluginDir, { recursive: true });

                fs.writeFileSync(
                    path.join(localPluginDir, 'plugin.yaml'),
                    `name: product-data
module: ./product-data
contracts:
  - name: product
    contract: ./product.jay-contract
    component: productData`,
                );

                fs.writeFileSync(
                    path.join(localPluginDir, 'product.jay-contract'),
                    `name: product
tags:
  - tag: name
    type: data
    dataType: string
  - tag: price
    type: data
    dataType: string`,
                );

                fs.writeFileSync(
                    path.join(localPagesDir, 'page.jay-html'),
                    `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-data">
        data:
    </script>
    <script type="application/jay-headless"
            plugin="product-data"
            contract="product"
            key="product"
    ></script>
</head>
<body>
    <div>{product.name}</div>
</body>
</html>`,
                );

                const localConfig: Required<JayConfig> = {
                    devServer: {
                        portRange: [3000, 3010],
                        pagesBase: localPagesDir,
                        componentsBase: path.join(localTestDir, 'components'),
                        publicFolder: path.join(localTestDir, 'public'),
                        configBase: path.join(localTestDir, 'config'),
                    },
                    editorServer: {
                        portRange: [3000, 3010],
                        editorId: 'xxx-xxx',
                    },
                };

                const handlers = createEditorHandlers(localConfig, './tsconfig.json', localTestDir);

                const result = await handlers.onGetProjectInfo({
                    type: 'getProjectInfo',
                });

                expect(result.success).toBe(true);
                expect(result.info.pages).toHaveLength(1);

                const page = result.info.pages[0];
                expect(page.usedComponents).toHaveLength(1);
                expect(page.usedComponents[0].appName).toBe('product-data');
                expect(page.usedComponents[0].componentName).toBe('product');
                expect(page.usedComponents[0].key).toBe('product');

                expect(result.info.plugins).toBeDefined();
                const plugin = result.info.plugins.find((p: any) => p.name === 'product-data');
                expect(plugin).toBeDefined();
                expect(plugin.contracts).toHaveLength(1);
                expect(plugin.contracts[0].name).toBe('product');
            } finally {
                fs.rmSync(localTestDir, { recursive: true, force: true });
            }
        });

        it('should return complete installed app contracts', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

            // Create test package.json with plugin dependency
            createTestPackageJson(['shop-app']);

            // No need for installed app configuration - using plugin system instead

            // Create the app contract files in node_modules
            const nodeModulesAppDir = path.join(process.cwd(), 'node_modules', 'shop-app');
            fs.mkdirSync(nodeModulesAppDir, { recursive: true });

            // Create plugin.yaml for shop-app with multiple contracts
            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'plugin.yaml'),
                `name: shop-app
module: shop-app
contracts:
  - name: product
    contract: product.jay-contract
    component: productPage
  - name: category
    contract: category.jay-contract
    component: categoryPage
  - name: cart
    contract: cart.jay-contract
    component: cartDrawer`,
            );

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
    trackBy: id
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
    trackBy: productId
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
                JSON.stringify({
                    name: 'shop-app',
                    version: '1.0.0',
                    exports: {
                        '.': './index.js',
                        './plugin.yaml': './plugin.yaml',
                        './product.jay-contract': './product.jay-contract',
                        './category.jay-contract': './category.jay-contract',
                        './cart.jay-contract': './cart.jay-contract',
                    },
                }),
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);

            // Clean up
            fs.rmSync(nodeModulesAppDir, { recursive: true, force: true });
        });

        it('should handle parameterized routes correctly', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            expect(productPage.contract).toBeDefined();
            expect(productPage.contract.tags[0].tag).toBe('productId');
        });

        it('should handle nested parameterized routes', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

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
            expect(homePage.contract).toBeDefined();
            expect(homePage.contract.tags).toHaveLength(2);

            // Check that the linked sub-contract was resolved
            const featuredTag = homePage.contract.tags[1];
            expect(featuredTag.tag).toBe('featured');
            expect(featuredTag.type).toBe('subContract');
            expect(featuredTag.tags).toBeDefined();
            expect(featuredTag.tags).toHaveLength(2);
            expect(featuredTag.tags[0].tag).toBe('title');
            expect(featuredTag.tags[1].tag).toBe('description');
        });

        it('should handle multiple pages using the same app component', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

            // Create test package.json with plugin dependency
            createTestPackageJson(['test-app']);

            // Create two pages that use the same app component
            fs.mkdirSync(testPagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-html'),
                `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-data">
        data:
    </script>
    <script type="application/jay-headless"
            plugin="test-app"
            contract="analytics"
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
    <script type="application/jay-data">
        data:
    </script>
    <script type="application/jay-headless"
            plugin="test-app"
            contract="analytics"
            key="an"
    ></script>
</head>
<body><div>About</div></body>
</html>`,
            );

            const nodeModulesAppDir = path.join(process.cwd(), 'node_modules', 'test-app');
            fs.mkdirSync(nodeModulesAppDir, { recursive: true });

            // Create plugin.yaml for the plugin system
            fs.writeFileSync(
                path.join(nodeModulesAppDir, 'plugin.yaml'),
                `name: test-app
module: test-app
contracts:
  - name: analytics
    contract: analytics.jay-contract
    component: analytics`,
            );

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
                JSON.stringify({
                    name: 'test-app',
                    version: '1.0.0',
                    exports: {
                        '.': './index.js',
                        './plugin.yaml': './plugin.yaml',
                        './analytics.jay-contract': './analytics.jay-contract',
                    },
                }),
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

            // Clean up
            fs.rmSync(nodeModulesAppDir, { recursive: true, force: true });
        });

        it('should handle complex scenario with page contracts and multiple app components', async () => {
            const handlers = createEditorHandlers(testConfig, TS_CONFIG, process.cwd());

            // Create test package.json with plugin dependencies
            createTestPackageJson(['shop-app', 'analytics-app']);

            // Create page with its own contract and using multiple app components
            fs.mkdirSync(testPagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(testPagesDir, 'page.jay-html'),
                `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-data">
        data:
          siteTitle: string
    </script>
    <script type="application/jay-headless"
            plugin="shop-app"
            contract="product"
            key="pp"
    ></script>
    <script type="application/jay-headless"
            plugin="analytics-app"
            contract="tracker"
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

            const shopNodeModules = path.join(process.cwd(), 'node_modules', 'shop-app');
            fs.mkdirSync(shopNodeModules, { recursive: true });

            // Create plugin.yaml for shop-app
            fs.writeFileSync(
                path.join(shopNodeModules, 'plugin.yaml'),
                `name: shop-app
module: shop-app
contracts:
  - name: product
    contract: product.jay-contract
    component: productPage`,
            );

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
                JSON.stringify({
                    name: 'shop-app',
                    version: '1.0.0',
                    exports: {
                        '.': './index.js',
                        './plugin.yaml': './plugin.yaml',
                        './product.jay-contract': './product.jay-contract',
                    },
                }),
            );

            const analyticsNodeModules = path.join(process.cwd(), 'node_modules', 'analytics-app');
            fs.mkdirSync(analyticsNodeModules, { recursive: true });

            // Create plugin.yaml for analytics-app
            fs.writeFileSync(
                path.join(analyticsNodeModules, 'plugin.yaml'),
                `name: analytics-app
module: analytics-app
contracts:
  - name: tracker
    contract: tracker.jay-contract
    component: tracker`,
            );

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
                JSON.stringify({
                    name: 'analytics-app',
                    version: '1.0.0',
                    exports: {
                        '.': './index.js',
                        './plugin.yaml': './plugin.yaml',
                        './tracker.jay-contract': './tracker.jay-contract',
                    },
                }),
            );

            const result = await handlers.onGetProjectInfo({
                type: 'getProjectInfo',
            });

            expect(result.success).toBe(true);
            expect(result.info.pages).toHaveLength(1);

            const homePage = result.info.pages[0];

            // Check page's own contract
            expect(homePage.contract).toBeDefined();
            expect(homePage.contract.name).toBe('home');
            expect(homePage.contract.tags).toHaveLength(2);
            expect(homePage.contract.tags[0].tag).toBe('siteTitle');
            expect(homePage.contract.tags[1].tag).toBe('description');

            // Check used component references
            expect(homePage.usedComponents).toHaveLength(2);
            expect(homePage.usedComponents).toContainEqual(
                expect.objectContaining({
                    appName: 'shop-app',
                    componentName: 'product',
                }),
            );
            expect(homePage.usedComponents).toContainEqual(
                expect.objectContaining({
                    appName: 'analytics-app',
                    componentName: 'tracker',
                }),
            );

            // Clean up
            fs.rmSync(shopNodeModules, { recursive: true, force: true });
            fs.rmSync(analyticsNodeModules, { recursive: true, force: true });
        });
    });
});
