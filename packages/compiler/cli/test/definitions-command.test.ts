import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rollup } from 'rollup';
import { jayDefinitions } from '@jay-framework/rollup-plugin';
import { promises as fsp } from 'fs';
import path from 'path';
import { getJayHtmlOrContractFileInputs } from '../lib/find-all-jay-element-contract-files';

describe('definitions command', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');

    // Clean up generated files after each test
    afterEach(async () => {
        const cleanupDirs = ['simple-html', 'simple-contract', 'html-with-contract'];

        for (const dir of cleanupDirs) {
            const fullDir = path.join(fixturesDir, dir);
            try {
                const files = await fsp.readdir(fullDir);
                for (const file of files) {
                    if (file.endsWith('.d.ts') || file.endsWith('.ts.map')) {
                        await fsp.unlink(path.join(fullDir, file));
                    }
                }
            } catch (e) {
                // Directory might not exist, that's ok
            }
        }
    });

    it('should generate .d.ts for jay-html with inline data', async () => {
        const sourceDir = path.join(fixturesDir, 'simple-html');

        const build = await rollup({
            input: getJayHtmlOrContractFileInputs(sourceDir),
            plugins: [jayDefinitions()],
        });

        // Close the bundle to complete the build
        await build.close();

        // Check that .d.ts file was generated
        const generatedFile = path.join(sourceDir, 'simple.jay-html.d.ts');
        const content = await fsp.readFile(generatedFile, 'utf-8');

        // Verify content
        expect(content).toContain('export interface SimpleViewState');
        expect(content).toContain('title: string');
        expect(content).toContain('content: string');
        expect(content).toContain('export interface SimpleElementRefs');

        // Verify phase-specific types (inline data defaults to interactive)
        expect(content).toContain('export type SimpleSlowViewState = {}');
        expect(content).toContain('export type SimpleFastViewState = {}');
        expect(content).toContain('export type SimpleInteractiveViewState = SimpleViewState');

        // Verify 5-parameter JayContract
        expect(content).toContain('export type SimpleContract = JayContract<');
        expect(content).toContain('SimpleViewState,');
        expect(content).toContain('SimpleElementRefs,');
        expect(content).toContain('SimpleSlowViewState,');
        expect(content).toContain('SimpleFastViewState,');
        expect(content).toContain('SimpleInteractiveViewState');
    });

    it('should generate .d.ts for jay-contract', async () => {
        const sourceDir = path.join(fixturesDir, 'simple-contract');

        const build = await rollup({
            input: getJayHtmlOrContractFileInputs(sourceDir),
            plugins: [jayDefinitions()],
        });

        // Close the bundle to complete the build
        await build.close();

        // Check that .d.ts file was generated
        const generatedFile = path.join(sourceDir, 'product.jay-contract.d.ts');
        const content = await fsp.readFile(generatedFile, 'utf-8');

        // Verify content
        expect(content).toContain('export interface ProductViewState');
        expect(content).toContain('name: string');
        expect(content).toContain('price: number');
        expect(content).toContain('quantity: number');
        expect(content).toContain('export interface ProductRefs');
        expect(content).toContain('addToCart: HTMLElementProxy');

        // Verify phase-specific types (from contract phase annotations)
        expect(content).toContain(
            "export type ProductSlowViewState = Pick<ProductViewState, 'name'>",
        );
        expect(content).toContain(
            "export type ProductFastViewState = Pick<ProductViewState, 'price' | 'quantity'>",
        );
        expect(content).toContain(
            "export type ProductInteractiveViewState = Pick<ProductViewState, 'quantity'>",
        );

        // Verify 5-parameter JayContract
        expect(content).toContain('export type ProductContract = JayContract<');
        expect(content).toContain('ProductViewState,');
        expect(content).toContain('ProductRefs,');
        expect(content).toContain('ProductSlowViewState,');
        expect(content).toContain('ProductFastViewState,');
        expect(content).toContain('ProductInteractiveViewState');
    });

    it('should generate .d.ts for jay-html with contract reference', async () => {
        const sourceDir = path.join(fixturesDir, 'html-with-contract');

        const build = await rollup({
            input: getJayHtmlOrContractFileInputs(sourceDir),
            plugins: [jayDefinitions()],
        });

        // Close the bundle to complete the build
        await build.close();

        // Check that .d.ts files were generated for both HTML and contract
        const htmlGeneratedFile = path.join(sourceDir, 'page.jay-html.d.ts');
        const contractGeneratedFile = path.join(sourceDir, 'page.jay-contract.d.ts');

        const htmlContent = await fsp.readFile(htmlGeneratedFile, 'utf-8');
        const contractContent = await fsp.readFile(contractGeneratedFile, 'utf-8');

        // Verify HTML .d.ts IMPORTS types from contract instead of redefining them
        expect(htmlContent).toContain('import {');
        expect(htmlContent).toContain('PageViewState,');
        expect(htmlContent).toContain('PageRefs as PageElementRefs,');
        expect(htmlContent).toContain('PageSlowViewState,');
        expect(htmlContent).toContain('PageFastViewState,');
        expect(htmlContent).toContain('PageInteractiveViewState,');
        expect(htmlContent).toContain('PageContract');
        expect(htmlContent).toContain("} from './page.jay-contract';");

        // Verify HTML .d.ts re-exports the imported types
        expect(htmlContent).toContain(
            'export { PageViewState, PageElementRefs, PageSlowViewState, PageFastViewState, PageInteractiveViewState, PageContract }',
        );

        // Verify HTML .d.ts does NOT redefine ViewState (no duplication!)
        expect(htmlContent).not.toContain('export interface PageViewState');
        expect(htmlContent).not.toContain('export type PageSlowViewState = Pick<');
        expect(htmlContent).not.toContain('export type PageFastViewState = Pick<');
        expect(htmlContent).not.toContain('export type PageInteractiveViewState = Pick<');

        // Verify HTML .d.ts still has HTML-specific types
        expect(htmlContent).toContain('export type PageElement = JayElement<');
        expect(htmlContent).toContain('export type PageElementRender = RenderElement<');
        expect(htmlContent).toContain('export declare function render(');

        // Verify contract .d.ts still exists and has the original definitions
        expect(contractContent).toContain('export interface PageViewState');
        expect(contractContent).toContain('export type PageSlowViewState = Pick<PageViewState');
        expect(contractContent).toContain('export type PageContract = JayContract<');

        // Verify contract .d.ts also exists
        expect(contractContent).toContain('export interface PageViewState');
        expect(contractContent).toContain('export type PageContract = JayContract<');
    });
});
