import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import path from 'path';
import { generateFiles } from '../lib/generate-files';
import { generateElementFile } from '@jay-framework/compiler';
import { GenerateTarget, RuntimeMode } from '@jay-framework/compiler-shared';

describe('runtime command', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    const outputDir = path.join(__dirname, 'output');

    // Clean up generated files after each test
    afterEach(async () => {
        const cleanupDirs = ['simple-html', 'simple-contract', 'html-with-contract'];

        // Clean up source directories
        for (const dir of cleanupDirs) {
            const fullDir = path.join(fixturesDir, dir);
            try {
                const files = await fsp.readdir(fullDir);
                for (const file of files) {
                    if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
                        await fsp.unlink(path.join(fullDir, file));
                    }
                }
            } catch (e) {
                // Directory might not exist, that's ok
            }
        }

        // Clean up output directory
        try {
            await fsp.rm(outputDir, { recursive: true, force: true });
        } catch (e) {
            // Directory might not exist, that's ok
        }
    });

    it('should generate .ts for jay-html with inline data', async () => {
        const sourceDir = path.join(fixturesDir, 'simple-html');

        await generateFiles(
            sourceDir,
            generateElementFile,
            () => {},
            '.ts',
            undefined, // No destination dir (generate in source)
            'jay',
        );

        // Check that .ts file was generated
        const generatedFile = path.join(sourceDir, 'simple.jay-html.ts');
        const content = await fsp.readFile(generatedFile, 'utf-8');

        // Verify content
        expect(content).toContain('export interface SimpleViewState');
        expect(content).toContain('title: string');
        expect(content).toContain('content: string');
        expect(content).toContain('export interface SimpleElementRefs');

        // Verify phase-specific types
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

        // Verify render function
        expect(content).toContain('export function render(');
        expect(content).toContain('SimpleElementPreRender');
    });

    it('should not generate files for standalone jay-contract (only HTML files)', async () => {
        const sourceDir = path.join(fixturesDir, 'simple-contract');

        await generateFiles(sourceDir, generateElementFile, () => {}, '.ts', undefined, 'jay');

        // The runtime command only processes .jay-html files, not standalone .jay-contract files
        // Contracts are only compiled when referenced by HTML files
        const generatedFile = path.join(sourceDir, 'product.jay-contract.ts');

        // Verify the file was NOT generated
        let fileExists = false;
        try {
            await fsp.access(generatedFile);
            fileExists = true;
        } catch (e) {
            // Expected: file should not exist
        }

        expect(fileExists).toBe(false);
    });

    it('should generate .ts for jay-html with contract reference', async () => {
        const sourceDir = path.join(fixturesDir, 'html-with-contract');

        await generateFiles(sourceDir, generateElementFile, () => {}, '.ts', undefined, 'jay');

        // Check that .ts file was generated for HTML (contract is not compiled separately by runtime command)
        const htmlGeneratedFile = path.join(sourceDir, 'page.jay-html.ts');

        const htmlContent = await fsp.readFile(htmlGeneratedFile, 'utf-8');

        // Verify HTML .ts uses contract's ViewState
        expect(htmlContent).toContain('export interface PageViewState');
        expect(htmlContent).toContain('title: string');
        expect(htmlContent).toContain('description: string');
        expect(htmlContent).toContain('price: number');
        expect(htmlContent).toContain('stock: number');

        // Verify HTML .ts has refs
        expect(htmlContent).toContain('export interface PageElementRefs');
        expect(htmlContent).toContain('buyButton: HTMLElementProxy');

        // Verify HTML .ts has phase-specific types from contract
        expect(htmlContent).toContain(
            "export type PageSlowViewState = Pick<PageViewState, 'title' | 'description'>",
        );
        expect(htmlContent).toContain(
            "export type PageFastViewState = Pick<PageViewState, 'price' | 'stock'>",
        );
        expect(htmlContent).toContain(
            "export type PageInteractiveViewState = Pick<PageViewState, 'stock'>",
        );

        // Verify HTML .ts has 5-parameter JayContract
        expect(htmlContent).toContain('export type PageContract = JayContract<');
        expect(htmlContent).toContain('PageViewState,');
        expect(htmlContent).toContain('PageElementRefs,');
        expect(htmlContent).toContain('PageSlowViewState,');
        expect(htmlContent).toContain('PageFastViewState,');
        expect(htmlContent).toContain('PageInteractiveViewState');

        // Verify render function
        expect(htmlContent).toContain('export function render(');

        // Note: The runtime command does NOT generate standalone .ts files for contracts
        // Contracts are only compiled when referenced by HTML files, and the types are
        // included in the HTML's generated .ts file
    });

    it('should generate files to custom destination directory', async () => {
        const sourceDir = path.join(fixturesDir, 'simple-html');
        const destDir = outputDir;

        await generateFiles(sourceDir, generateElementFile, () => {}, '.ts', destDir, 'jay');

        // Check that .ts file was generated in destination directory
        const generatedFile = path.join(destDir, 'simple.jay-html.ts');
        const content = await fsp.readFile(generatedFile, 'utf-8');

        // Verify file exists and has expected content
        expect(content).toContain('export interface SimpleViewState');
        expect(content).toContain('export type SimpleContract = JayContract<');
    });
});
