import { describe, it, expect } from 'vitest';
import {
    generateElementDefinitionFile,
    parseContract,
    compileContract,
    generateElementFile,
} from '../lib';
import {
    readAndParseJayFile,
    readFixtureElementDefinitionFile,
    readFixtureFileRaw,
} from './test-utils/file-utils';
import { checkValidationErrors, prettify, RuntimeMode } from '@jay-framework/compiler-shared';
import { JAY_IMPORT_RESOLVER } from '../lib';
import path from 'path';
import { promises as fsp } from 'fs';

describe('Jay HTML with Contract References', () => {
    it('should compile HTML with contract reference (simple)', async () => {
        const folder = 'html-with-contract-ref/simple-with-contract';
        const parsedFile = await readAndParseJayFile(folder, 'page');
        const definitionFile = generateElementDefinitionFile(parsedFile);

        expect(definitionFile.validations).toEqual([]);
        expect(await prettify(definitionFile.val)).toEqual(
            await readFixtureElementDefinitionFile(folder, 'page.jay-html.d.ts'),
        );
    });

    it('should compile contract definition file correctly', async () => {
        const folder = 'html-with-contract-ref/simple-with-contract';
        const contractPath = path.join(__dirname, 'fixtures', folder, 'page.jay-contract');

        // Read and parse the contract
        const contractContent = await fsp.readFile(contractPath, 'utf-8');
        const parsedContract = parseContract(contractContent, 'page.jay-contract');

        // Compile the contract
        const compiledContract = await compileContract(
            parsedContract,
            contractPath,
            JAY_IMPORT_RESOLVER,
        );

        expect(compiledContract.validations).toEqual([]);
        expect(await prettify(compiledContract.val)).toEqual(
            await readFixtureElementDefinitionFile(folder, 'page.jay-contract.d.ts'),
        );
    });

    it('should generate unique ref const names when same ref name exists in different branches', async () => {
        // This test verifies the fix for the duplicate symbol error that occurs when
        // the same ref name (e.g., 'button') exists in different sub-contract branches
        // (e.g., options.items.button and modifiers.items.button)
        const folder = 'contracts/duplicate-ref-names';
        const parsedFile = await readAndParseJayFile(folder, 'duplicate-ref-names');

        expect(parsedFile.validations).toEqual([]);

        const jayFile = checkValidationErrors(parsedFile);
        const elementFile = generateElementFile(jayFile, RuntimeMode.MainTrusted);

        expect(elementFile.validations).toEqual([]);
        expect(await prettify(elementFile.val)).toEqual(
            await prettify(await readFixtureFileRaw(folder, 'duplicate-ref-names.jay-html.ts')),
        );
    });

    describe('with headless component', () => {
        it('should include headless component types in jay-html.d.ts when using contract reference', async () => {
            // This test verifies that headless component types are properly merged into ViewState
            // when the jay-html file uses an external contract reference
            const folder = 'contracts/page-with-headless-and-contract';
            const parsedFile = await readAndParseJayFile(folder, 'page');

            expect(parsedFile.validations).toEqual([]);

            const definitionFile = generateElementDefinitionFile(parsedFile);
            expect(definitionFile.validations).toEqual([]);

            const generated = await prettify(definitionFile.val);
            const expected = await readFixtureElementDefinitionFile(folder, 'page.jay-html.d.ts');

            expect(generated).toEqual(expected);
        });

        it('should NOT include headless component types in jay-contract.d.ts', async () => {
            // This test verifies that the contract.d.ts remains pure and does NOT include
            // headless component types - those should only be in the jay-html.d.ts
            const folder = 'contracts/page-with-headless-and-contract';
            const contractPath = path.join(__dirname, 'fixtures', folder, 'page.jay-contract');
            const contractContent = await fsp.readFile(contractPath, 'utf-8');
            const parsedContract = parseContract(contractContent, 'page.jay-contract');
            const compiledContract = await compileContract(
                parsedContract,
                contractPath,
                JAY_IMPORT_RESOLVER,
            );

            expect(compiledContract.validations).toEqual([]);
            const generatedContract = await prettify(compiledContract.val);
            const expectedContract = await readFixtureElementDefinitionFile(folder, 'page.jay-contract.d.ts');

            expect(generatedContract).toEqual(expectedContract);
        });
    })

    describe('with recursive reference', () => {
        it('should handle recursive references in jay-html.d.ts when using contract reference', async () => {
            // This test verifies that recursive type references ($/data) are properly resolved
            // when the jay-html file uses an external contract reference
            const folder = 'contracts/contract-with-recursive-ref';
            const parsedFile = await readAndParseJayFile(folder, 'tree');

            expect(parsedFile.validations).toEqual([]);

            const definitionFile = generateElementDefinitionFile(parsedFile);
            expect(definitionFile.validations).toEqual([]);

            const generated = await prettify(definitionFile.val);
            const expected = await readFixtureElementDefinitionFile(folder, 'tree.jay-html.d.ts');

            expect(generated).toEqual(expected);
        });

        it('should handle recursive references in jay-contract.d.ts when using contract reference', async () => {
            // This test verifies that recursive type references ($/data) are properly resolved
            // in the contract.d.ts file
            const folder = 'contracts/contract-with-recursive-ref';
            const contractPath = path.join(__dirname, 'fixtures', folder, 'tree.jay-contract');
            const contractContent = await fsp.readFile(contractPath, 'utf-8');
            const parsedContract = parseContract(contractContent, 'tree.jay-contract');
            const compiledContract = await compileContract(
                parsedContract,
                contractPath,
                JAY_IMPORT_RESOLVER,
            );

            expect(compiledContract.validations).toEqual([]);
            const generatedContract = await prettify(compiledContract.val);
            const expectedContract = await readFixtureElementDefinitionFile(folder, 'tree.jay-contract.d.ts');

            expect(generatedContract).toEqual(expectedContract);
        });
    })
});
