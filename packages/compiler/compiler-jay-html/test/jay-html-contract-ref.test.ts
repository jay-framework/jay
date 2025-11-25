import { describe, it, expect } from 'vitest';
import { generateElementDefinitionFile } from '../lib';
import { readAndParseJayFile, readFixtureElementDefinitionFile } from './test-utils/file-utils';
import { prettify } from '@jay-framework/compiler-shared';

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
});

