import { describe, it, expect, afterEach } from 'vitest';
import { rollup } from 'rollup';
import { jayDefinitions } from '@jay-framework/rollup-plugin';
import { promises as fsp } from 'fs';
import path from 'path';
import { getJayHtmlOrContractFileInputs } from '../lib/find-all-jay-element-contract-files';
import { prettify } from '@jay-framework/compiler-shared';

describe('definitions command', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');

    // Clean up generated files after each test
    // Note: We keep the fixture files (*.expected.*) and only clean up generated files
    afterEach(async () => {
        const cleanupDirs = ['simple-html', 'simple-contract', 'html-with-contract'];

        for (const dir of cleanupDirs) {
            const fullDir = path.join(fixturesDir, dir);
            try {
                const files = await fsp.readdir(fullDir);
                for (const file of files) {
                    // Only delete generated files, not committed fixture files (*.expected.*)
                    if (
                        (file.endsWith('.d.ts') || file.endsWith('.ts.map')) &&
                        !file.includes('.expected.')
                    ) {
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
        const expectedFile = path.join(sourceDir, 'simple.expected.jay-html.d.ts');
        const generatedFile = path.join(sourceDir, 'simple.jay-html.d.ts');

        // Read the expected output
        const expected = await fsp.readFile(expectedFile, 'utf-8');

        const build = await rollup({
            input: getJayHtmlOrContractFileInputs(sourceDir),
            plugins: [jayDefinitions('')],
        });

        // Close the bundle to complete the build
        await build.close();

        // Read the generated file
        const generated = await fsp.readFile(generatedFile, 'utf-8');

        expect(await prettify(generated)).toEqual(await prettify(expected));
    });

    it('should generate .d.ts for jay-contract', async () => {
        const sourceDir = path.join(fixturesDir, 'simple-contract');
        const expectedFile = path.join(sourceDir, 'product.expected.jay-contract.d.ts');
        const generatedFile = path.join(sourceDir, 'product.jay-contract.d.ts');

        // Read the expected output
        const expected = await fsp.readFile(expectedFile, 'utf-8');

        const build = await rollup({
            input: getJayHtmlOrContractFileInputs(sourceDir),
            plugins: [jayDefinitions('')],
        });

        // Close the bundle to complete the build
        await build.close();

        // Read the generated file
        const generated = await fsp.readFile(generatedFile, 'utf-8');

        expect(await prettify(generated)).toEqual(await prettify(expected));
    });

    it('should generate .d.ts for jay-html with contract reference', async () => {
        const sourceDir = path.join(fixturesDir, 'html-with-contract');
        const htmlExpectedFile = path.join(sourceDir, 'page.expected.jay-html.d.ts');
        const htmlGeneratedFile = path.join(sourceDir, 'page.jay-html.d.ts');
        const contractExpectedFile = path.join(sourceDir, 'page.expected.jay-contract.d.ts');
        const contractGeneratedFile = path.join(sourceDir, 'page.jay-contract.d.ts');

        // Read the expected outputs
        const htmlExpected = await fsp.readFile(htmlExpectedFile, 'utf-8');
        const contractExpected = await fsp.readFile(contractExpectedFile, 'utf-8');

        const build = await rollup({
            input: getJayHtmlOrContractFileInputs(sourceDir),
            plugins: [jayDefinitions('')],
        });

        // Close the bundle to complete the build
        await build.close();

        // Read the generated files
        const htmlGenerated = await fsp.readFile(htmlGeneratedFile, 'utf-8');
        const contractGenerated = await fsp.readFile(contractGeneratedFile, 'utf-8');

        expect(await prettify(htmlGenerated)).toEqual(await prettify(htmlExpected));
        expect(await prettify(contractGenerated)).toEqual(await prettify(contractExpected));
    });
});
