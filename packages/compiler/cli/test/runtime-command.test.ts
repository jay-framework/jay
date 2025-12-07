import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import path from 'path';
import { generateFiles } from '../lib/generate-files';
import { generateElementFile } from '@jay-framework/compiler';
import { prettify } from '@jay-framework/compiler-shared';

describe('runtime command', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    const outputDir = path.join(__dirname, 'output');

    // Clean up generated files after each test
    // Note: We keep the fixture files (*.expected.*) and only clean up generated files
    afterEach(async () => {
        const cleanupDirs = ['simple-html', 'simple-contract', 'html-with-contract'];

        // Clean up source directories
        for (const dir of cleanupDirs) {
            const fullDir = path.join(fixturesDir, dir);
            try {
                const files = await fsp.readdir(fullDir);
                for (const file of files) {
                    // Only delete generated .ts files, not committed fixture files (*.expected.*)
                    if (
                        file.endsWith('.ts') &&
                        !file.endsWith('.d.ts') &&
                        !file.includes('.expected.')
                    ) {
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
        const expectedFile = path.join(sourceDir, 'simple.expected.jay-html.ts');
        const generatedFile = path.join(sourceDir, 'simple.jay-html.ts');

        // Read the expected output
        const expected = await fsp.readFile(expectedFile, 'utf-8');

        await generateFiles(
            sourceDir,
            generateElementFile,
            () => {},
            '.ts',
            undefined, // No destination dir (generate in source)
            'jay',
        );

        // Read the generated file
        const generated = await fsp.readFile(generatedFile, 'utf-8');

        expect(await prettify(generated)).toEqual(await prettify(expected));
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
        const expectedFile = path.join(sourceDir, 'page.expected.jay-html.ts');
        const generatedFile = path.join(sourceDir, 'page.jay-html.ts');

        // Read the expected output
        const expected = await fsp.readFile(expectedFile, 'utf-8');

        await generateFiles(sourceDir, generateElementFile, () => {}, '.ts', undefined, 'jay');

        // Read the generated file
        const generated = await fsp.readFile(generatedFile, 'utf-8');

        expect(await prettify(generated)).toEqual(await prettify(expected));

        // Note: The runtime command does NOT generate standalone .ts files for contracts
        // Contracts are only compiled when referenced by HTML files, and the types are
        // included in the HTML's generated .ts file
    });

    it('should generate files to custom destination directory', async () => {
        const sourceDir = path.join(fixturesDir, 'simple-html');
        const destDir = outputDir;
        const expectedFile = path.join(fixturesDir, 'simple-html', 'simple.expected.jay-html.ts');

        // Read the expected output
        const expected = await fsp.readFile(expectedFile, 'utf-8');

        await generateFiles(sourceDir, generateElementFile, () => {}, '.ts', destDir, 'jay');

        // Check that .ts file was generated in destination directory
        const generatedFile = path.join(destDir, 'simple.jay-html.ts');
        const generated = await fsp.readFile(generatedFile, 'utf-8');

        expect(await prettify(generated)).toEqual(await prettify(expected));
    });
});
