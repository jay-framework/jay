import { generateElementDefinitionFile, prettify } from '../lib';
import { readGeneratedElementDefinitionFile } from './test-utils/file-utils';
import { readAndParseJayFile } from './test-utils/ts-compiler-test-utils';

describe('generate the definition file', () => {
    it('should generate definition file for simple file', async () => {
        const folder = 'basics/data-types';
        const parsedFile = await readAndParseJayFile(folder);
        let definitionFile = generateElementDefinitionFile(parsedFile);
        expect(definitionFile.validations).toEqual([]);
        expect(await prettify(definitionFile.val)).toEqual(
            await readGeneratedElementDefinitionFile(folder),
        );
    });

    it('should generate definition file for collection file', async () => {
        const folder = 'collections/collections';
        const parsedFile = await readAndParseJayFile(folder);
        let definitionFile = generateElementDefinitionFile(parsedFile);
        expect(definitionFile.validations).toEqual([]);
        expect(await prettify(definitionFile.val)).toEqual(
            await readGeneratedElementDefinitionFile(folder),
        );
    });

    it('for simple refs', async () => {
        const folder = 'components/counter';
        const parsedFile = await readAndParseJayFile(folder);
        let definitionFile = generateElementDefinitionFile(parsedFile);
        expect(definitionFile.validations).toEqual([]);
        expect(await prettify(definitionFile.val)).toEqual(
            await readGeneratedElementDefinitionFile(folder, 'generated-element-main-trusted.d.ts'),
        );
    });

    it('for conditional with refs', async () => {
        const folder = 'conditions/conditions-with-refs';
        const parsedFile = await readAndParseJayFile(folder);
        let definitionFile = generateElementDefinitionFile(parsedFile);
        expect(definitionFile.validations).toEqual([]);
        expect(await prettify(definitionFile.val)).toEqual(
            await readGeneratedElementDefinitionFile(folder),
        );
    });

    it('for collection refs', async () => {
        const folder = 'collections/collection-with-refs';
        const parsedFile = await readAndParseJayFile(folder);
        let definitionFile = generateElementDefinitionFile(parsedFile);
        expect(definitionFile.validations).toEqual([]);
        expect(await prettify(definitionFile.val)).toEqual(
            await readGeneratedElementDefinitionFile(folder),
        );
    });

    it('for nesting components in other components', async () => {
        const folder = 'components/component-in-component';
        const parsedFile = await readAndParseJayFile(folder);
        let runtimeFile = generateElementDefinitionFile(parsedFile);
        expect(runtimeFile.validations).toEqual([]);
        expect(await prettify(runtimeFile.val)).toEqual(
            await readGeneratedElementDefinitionFile(folder, 'generated-element-main-trusted.d.ts'),
        );
    });
});
