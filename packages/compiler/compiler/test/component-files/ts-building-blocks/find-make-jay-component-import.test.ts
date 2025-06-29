import { findMakeJayComponentImportTransformerBlock } from '../../../lib/components-files/building-blocks/find-make-jay-component-import';
import { createTsSourceFile } from '../../test-utils/ts-source-utils';

describe('findMakeJayComponentImportTransformerBlock', () => {
    const makeJayComponentName = 'makeJayComponent';

    it('find import makeJayComponent', async () => {
        const sourceFile = createTsSourceFile(`
        | import { makeJayComponent } from '@jay-framework/component';
        `);
        const name = findMakeJayComponentImportTransformerBlock(makeJayComponentName, sourceFile);
        expect(name).toEqual('makeJayComponent');
    });

    it('find import makeJayComponent with other imports', async () => {
        const sourceFile = createTsSourceFile(`
        | import { makeJayComponent, two, three } from '@jay-framework/component';
        `);
        const name = findMakeJayComponentImportTransformerBlock(makeJayComponentName, sourceFile);
        expect(name).toEqual('makeJayComponent');
    });

    it('find import makeJayComponent with rename', async () => {
        const sourceFile = createTsSourceFile(`
        | import { makeJayComponent as two } from '@jay-framework/component';
        `);
        const name = findMakeJayComponentImportTransformerBlock(makeJayComponentName, sourceFile);
        expect(name).toEqual('two');
    });

    it('should not find import makeJayComponent from another package', async () => {
        const sourceFile = createTsSourceFile(`
        | import { makeJayComponent as two } from 'another package';
        `);
        const name = findMakeJayComponentImportTransformerBlock(makeJayComponentName, sourceFile);
        expect(name).not.toBeDefined();
    });

    it('should find import makeJayComponent given multiple imports', async () => {
        const sourceFile = createTsSourceFile(`
        | import { CounterElementRefs, render } from './generated-element';
        | import { createEvent, createSignal, makeJayComponent, Props } from '@jay-framework/component';
        `);
        const name = findMakeJayComponentImportTransformerBlock(makeJayComponentName, sourceFile);
        expect(name).toEqual('makeJayComponent');
    });
});
