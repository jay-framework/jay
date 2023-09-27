import { generateElementFile } from '../lib';
import { describe, expect, it } from '@jest/globals';
import {
    readGeneratedElementFile,
    readGeneratedNamedFile,
    readNamedSourceJayFile,
    readSourceJayFile,
} from './test-fs-utils';

describe('generate the runtime file', () => {
    describe('basics', () => {
        it('for simple file with dynamic text', async () => {
            const jayFile = await readSourceJayFile('basics/simple-dynamic-text');
            let runtimeFile = generateElementFile(
                jayFile,
                'simple-dynamic-text.jay.html',
                './test/'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('basics/simple-dynamic-text')
            );
        });

        it('for simple file with static text', async () => {
            const jayFile = await readSourceJayFile('basics/simple-static-text');
            let runtimeFile = generateElementFile(
                jayFile,
                'simple-static-text.jay.html',
                './test/'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('basics/simple-static-text')
            );
        });

        it('for an empty element', async () => {
            const jayFile = await readSourceJayFile('basics/empty-element');
            let runtimeFile = generateElementFile(jayFile, 'empty-element.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementFile('basics/empty-element'));
        });

        it('for different data types', async () => {
            const jayFile = await readSourceJayFile('basics/data-types');
            let runtimeFile = generateElementFile(jayFile, 'data-types.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementFile('basics/data-types'));
        });

        it('for a composition of divs', async () => {
            const jayFile = await readSourceJayFile('basics/composite');
            let runtimeFile = generateElementFile(jayFile, 'composite.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementFile('basics/composite'));
        });

        it('for composition of divs 2', async () => {
            const jayFile = await readSourceJayFile('basics/composite 2');
            let runtimeFile = generateElementFile(jayFile, 'composite 2.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementFile('basics/composite 2'));
        });

        it('for styles', async () => {
            const jayFile = await readSourceJayFile('basics/styles');
            let runtimeFile = generateElementFile(jayFile, 'styles.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementFile('basics/styles'));
        });

        it('refs', async () => {
            const jayFile = await readSourceJayFile('basics/refs');
            let runtimeFile = generateElementFile(jayFile, 'refs.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementFile('basics/refs'));
        });

        it('with different attributes and properties', async () => {
            const jayFile = await readSourceJayFile('basics/attributes');
            let runtimeFile = generateElementFile(jayFile, 'attributes.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementFile('basics/attributes'));
        });

        it('with different view state input types', async () => {
            const jayFile = await readSourceJayFile('basics/dynamic-text-input-types');
            let runtimeFile = generateElementFile(
                jayFile,
                'dynamic-text-input-types.jay.html',
                './test/'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('basics/dynamic-text-input-types')
            );
        });

        it('whitespace collapsing and handling', async () => {
            const jayFile = await readSourceJayFile('basics/whitespace-and-text');
            let runtimeFile = generateElementFile(
                jayFile,
                'whitespace-and-text.jay.html',
                './test/'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('basics/whitespace-and-text')
            );
        });
    });

    describe('conditions', () => {
        it('for conditional', async () => {
            const jayFile = await readSourceJayFile('conditions/conditions');
            let runtimeFile = generateElementFile(jayFile, 'conditions.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('conditions/conditions')
            );
        });

        it('for conditional with refs', async () => {
            const jayFile = await readSourceJayFile('conditions/conditions-with-refs');
            let runtimeFile = generateElementFile(
                jayFile,
                'conditions-with-refs.jay.html',
                './test/'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('conditions/conditions-with-refs')
            );
        });

        it('for enums and conditions', async () => {
            const jayFile = await readSourceJayFile('conditions/conditions-with-enum');
            let runtimeFile = generateElementFile(
                jayFile,
                'conditions-with-enum.jay.html',
                './test/'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('conditions/conditions-with-enum')
            );
        });
    });

    describe('collections', () => {
        it('for collections', async () => {
            const jayFile = await readSourceJayFile('collections/collections');
            let runtimeFile = generateElementFile(jayFile, 'collections.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('collections/collections')
            );
        });

        it('for collections with refs', async () => {
            const jayFile = await readSourceJayFile('collections/collection-with-refs');
            let runtimeFile = generateElementFile(
                jayFile,
                'collection-with-refs.jay.html',
                './test/fixtures/collections'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('collections/collection-with-refs')
            );
        });
    });

    describe('components', () => {
        it('for simple refs', async () => {
            const jayFile = await readSourceJayFile('components/counter');
            let runtimeFile = generateElementFile(jayFile, 'counter.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementFile('components/counter'));
        });

        it('nesting components in other components', async () => {
            const jayFile = await readSourceJayFile('components/component-in-component');
            let runtimeFile = generateElementFile(
                jayFile,
                'component-in-component.jay.html',
                './test/fixtures/components/component-in-component'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('components/component-in-component')
            );
        }, 10000);

        it('dynamic nesting components in other components', async () => {
            const jayFile = await readSourceJayFile('components/dynamic-component-in-component');
            let runtimeFile = generateElementFile(
                jayFile,
                'dynamic-component-in-component.jay.html',
                './test/fixtures/components/dynamic-component-in-component'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('components/dynamic-component-in-component')
            );
        });

        it('recursive-components', async () => {
            const jayFile = await readSourceJayFile('components/recursive-components');
            let runtimeFile = generateElementFile(
                jayFile,
                'recursive-components.jay.html',
                './test/fixtures/components/recursive-components'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('components/recursive-components')
            );
        });

        it('recursive-components-2', async () => {
            const jayFile = await readSourceJayFile('components/recursive-components-2');
            let runtimeFile = generateElementFile(
                jayFile,
                'recursive-components-2.jay.html',
                './test/fixtures/components/recursive-components-2'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedElementFile('components/recursive-components-2')
            );
        });

        it('tree', async () => {
            const jayFile = await readNamedSourceJayFile('components/tree', 'tree-node');
            let runtimeFile = generateElementFile(
                jayFile,
                'tree-node.jay.html',
                './test/fixtures/components/tree'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementFile('components/tree'));
        });

        it('sandbox component host', async () => {
            const jayFile = await readNamedSourceJayFile('sandboxed/sandboxed-counter', 'app');
            let runtimeFile = generateElementFile(
                jayFile,
                'app.jay.html',
                './test/fixtures/sandboxed/sandboxed-counter'
            );
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(
                await readGeneratedNamedFile('sandboxed/sandboxed-counter', 'generated-app.jay.html')
            );
        });
    });

    it.skip('tmp', async () => {
        const jayFile = await readSourceJayFile('tmp');
        let runtimeFile = generateElementFile(jayFile, 'tmp.jay.html', './test/');
        expect(runtimeFile.validations).toEqual([]);
        expect(runtimeFile.val).toEqual(await readGeneratedElementFile('tmp'));
    });
});
