import { describe, it, expect } from 'vitest';
import { generateElementDefinitionFile, parseContract, compileContract } from '../lib';
import { readAndParseJayFile, readFixtureElementDefinitionFile } from './test-utils/file-utils';
import { prettify } from '@jay-framework/compiler-shared';
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
        const compiledContract = await compileContract(parsedContract, contractPath, JAY_IMPORT_RESOLVER);
        
        expect(compiledContract.validations).toEqual([]);
        expect(await prettify(compiledContract.val)).toEqual(
            await readFixtureElementDefinitionFile(folder, 'page.jay-contract.d.ts'),
        );
    });
});
