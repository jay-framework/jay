import { generateDefinitionFile } from '../lib';
import { describe, expect, it } from '@jest/globals';
import { readGeneratedElementDefinitionFile, readSourceJayFile } from './test-fs-utils';

describe('generate the definition file', () => {
    it('should generate definition file for simple file', async () => {
        const jayFile = await readSourceJayFile('basics/data-types');
        let definitionFile = generateDefinitionFile(jayFile, 'data-types.jay.html', './test/');
        expect(definitionFile.validations).toEqual([]);
        expect(definitionFile.val).toEqual(
            await readGeneratedElementDefinitionFile('basics/data-types'),
        );
    });

    it('should generate definition file for collection file', async () => {
        const jayFile = await readSourceJayFile('collections/collections');
        let definitionFile = generateDefinitionFile(jayFile, 'collections.jay.html', './test/');
        expect(definitionFile.validations).toEqual([]);
        expect(definitionFile.val).toEqual(
            await readGeneratedElementDefinitionFile('collections/collections'),
        );
    });

    it('for simple refs', async () => {
        const jayFile = await readSourceJayFile('components/counter');
        let definitionFile = generateDefinitionFile(jayFile, 'counter.jay.html', './test/');
        expect(definitionFile.validations).toEqual([]);
        expect(definitionFile.val).toEqual(
            await readGeneratedElementDefinitionFile('components/counter'),
        );
    });

    it('for conditional with refs', async () => {
        const jayFile = await readSourceJayFile('conditions/conditions-with-refs');
        let definitionFile = generateDefinitionFile(
            jayFile,
            'conditions-with-refs.jay.html',
            './test/',
        );
        expect(definitionFile.validations).toEqual([]);
        expect(definitionFile.val).toEqual(
            await readGeneratedElementDefinitionFile('conditions/conditions-with-refs'),
        );
    });

    it('for collection refs', async () => {
        const jayFile = await readSourceJayFile('collections/collection-with-refs');
        let definitionFile = generateDefinitionFile(
            jayFile,
            'collection-with-refs.jay.html',
            './test/',
        );
        expect(definitionFile.validations).toEqual([]);
        expect(definitionFile.val).toEqual(
            await readGeneratedElementDefinitionFile('collections/collection-with-refs'),
        );
    });

    it('for nesting components in other components', async () => {
        const jayFile = await readSourceJayFile('components/component-in-component');
        let runtimeFile = generateDefinitionFile(
            jayFile,
            'component-in-component.jay.html',
            './test/fixtures/components/component-in-component',
        );
        expect(runtimeFile.validations).toEqual([]);
        expect(runtimeFile.val).toEqual(
            await readGeneratedElementDefinitionFile('components/component-in-component'),
        );
    }, 10000);
});
