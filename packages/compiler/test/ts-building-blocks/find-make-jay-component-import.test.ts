import { findMakeJayComponentImportTransformerBlock } from '../../lib/ts-file/building-blocks/find-make-jay-component-import';
import { createTsSourceFile } from '../test-utils/ts-source-utils';

describe('findMakeJayComponentImportTransformerBlock', () => {
    it('find import makeJayComponent', async () => {
        const sourceFile = createTsSourceFile(`
        | import { makeJayComponent } from 'jay-component';
        `);
        const makeJayComponentName = findMakeJayComponentImportTransformerBlock(sourceFile);
        expect(makeJayComponentName).toEqual('makeJayComponent');
    });

    it('find import makeJayComponent with other imports', async () => {
        const sourceFile = createTsSourceFile(`
        | import { makeJayComponent, two, three } from 'jay-component';
        `);
        const makeJayComponentName = findMakeJayComponentImportTransformerBlock(sourceFile);
        expect(makeJayComponentName).toEqual('makeJayComponent');
    });

    it('find import makeJayComponent with rename', async () => {
        const sourceFile = createTsSourceFile(`
        | import { makeJayComponent as two } from 'jay-component';
        `);
        const makeJayComponentName = findMakeJayComponentImportTransformerBlock(sourceFile);
        expect(makeJayComponentName).toEqual('two');
    });

    it('should not find import makeJayComponent from another package', async () => {
        const sourceFile = createTsSourceFile(`
        | import { makeJayComponent as two } from 'another package';
        `);
        const makeJayComponentName = findMakeJayComponentImportTransformerBlock(sourceFile);
        expect(makeJayComponentName).not.toBeDefined();
    });

    it('should find import makeJayComponent given multiple imports', async () => {
        const sourceFile = createTsSourceFile(`
        | import { CounterElementRefs, render } from './generated-element';
        | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
        `);
        const makeJayComponentName = findMakeJayComponentImportTransformerBlock(sourceFile);
        expect(makeJayComponentName).toEqual('makeJayComponent');
    });
});
