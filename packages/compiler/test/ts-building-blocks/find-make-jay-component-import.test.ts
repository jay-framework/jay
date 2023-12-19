import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import { stripMargin } from '../test-utils/strip-margin';
import { findMakeJayComponentImportTransformerBlock } from "../../lib/ts-file/building-blocks/find-make-jay-component-import-transformer";

describe('find makeJayComponent import', () => {
    function testTransformer() {
        let state = {
            makeJayComponentName: undefined,
            transformer: mkTransformer((sourceFileTransformerData) => {
                state.makeJayComponentName =
                    findMakeJayComponentImportTransformerBlock(sourceFileTransformerData);
                return sourceFileTransformerData.sourceFile;
            }),
        };
        return state;
    }

    it('find import makeJayComponent', async () => {
        const code = stripMargin(`import { makeJayComponent } from 'jay-component';`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.makeJayComponentName).toEqual('makeJayComponent');
    });

    it('find import makeJayComponent with other imports', async () => {
        const code = stripMargin(
            `import { makeJayComponent, two, three } from 'jay-component';`,
        );
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.makeJayComponentName).toEqual('makeJayComponent');
    });

    it('find import makeJayComponent with rename', async () => {
        const code = stripMargin(`import { makeJayComponent as two } from 'jay-component';`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.makeJayComponentName).toEqual('two');
    });

    it('should not find import makeJayComponent from another package', async () => {
        const code = stripMargin(`import { makeJayComponent as two } from 'another package';`);
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.makeJayComponentName).not.toBeDefined();
    });

    it('should find import makeJayComponent given multiple imports', async () => {
        const code = stripMargin(
            `import { CounterElementRefs, render } from './generated-element';
               | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';`,
        );
        const transformerState = testTransformer();
        await transformCode(code, [transformerState.transformer]);
        expect(transformerState.makeJayComponentName).toEqual('makeJayComponent');
    });
});

