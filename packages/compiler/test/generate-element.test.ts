import { prettify } from '../lib';
import { readGeneratedElementFile } from './test-utils/file-utils';
import { readFileAndGenerateElementFile } from './test-utils/ts-compiler-test-utils.ts';

describe('generate the runtime file', () => {
    describe('basics', () => {
        it('for simple file with dynamic text', async () => {
            const folder = 'basics/simple-dynamic-text';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('for simple file with static text', async () => {
            const folder = 'basics/simple-static-text';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('for an empty element', async () => {
            const folder = 'basics/empty-element';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('for different data types', async () => {
            const folder = 'basics/data-types';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('for a composition of divs', async () => {
            const folder = 'basics/composite';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('for composition of divs 2', async () => {
            const folder = 'basics/composite 2';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('for styles', async () => {
            const folder = 'basics/styles';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('refs', async () => {
            const folder = 'basics/refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('with different attributes and properties', async () => {
            const folder = 'basics/attributes';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('with different view state input types', async () => {
            const folder = 'basics/dynamic-text-input-types';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('whitespace collapsing and handling', async () => {
            const folder = 'basics/whitespace-and-text';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });
    });

    describe('conditions', () => {
        it('for conditional', async () => {
            const folder = 'conditions/conditions';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('for conditional with refs', async () => {
            const folder = 'conditions/conditions-with-refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('for enums and conditions', async () => {
            const folder = 'conditions/conditions-with-enum';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });
    });

    describe('collections', () => {
        it('for collections', async () => {
            const folder = 'collections/collections';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('for collections with refs', async () => {
            const folder = 'collections/collection-with-refs';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });
    });

    describe('components', () => {
        it('for simple refs', async () => {
            const folder = 'components/counter';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('nesting components in other components', async () => {
            const folder = 'components/component-in-component';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('dynamic nesting components in other components', async () => {
            const folder = 'components/dynamic-component-in-component';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('recursive-components', async () => {
            const folder = 'components/recursive-components';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('recursive-components-2', async () => {
            const folder = 'components/recursive-components-2';
            const elementFile = await readFileAndGenerateElementFile(folder);
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });

        it('tree', async () => {
            const folder = 'components/tree';
            const elementFile = await readFileAndGenerateElementFile(folder, 'tree-node');
            expect(elementFile.validations).toEqual([]);
            expect(await prettify(elementFile.val)).toEqual(await readGeneratedElementFile(folder));
        });
    });
});
