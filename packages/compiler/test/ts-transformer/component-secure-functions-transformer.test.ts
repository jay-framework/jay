import {
    componentSecureFunctionsTransformer,
    findMakeJayComponentImport,
} from '../../lib/ts-file/component-secure-functions-transformer';
import { readFileAndTsTransform, transformCode } from '../test-utils/ts-compiler-test-utils';
import { mkTransformer, SourceFileTransformerContext } from '../../lib/ts-file/mk-transformer.ts';
import { stripMargin } from '../test-utils/strip-margin.ts';

describe('secure functions transformer', () => {
    describe('find makeJayComponent import', () => {
        function loggingTransformer() {
            let state = {
                makeJayComponentName: undefined,
                transformer: mkTransformer((sourceFileTransformerData) => {
                    state.makeJayComponentName =
                        findMakeJayComponentImport(sourceFileTransformerData);
                    return sourceFileTransformerData.sourceFile;
                }),
            };
            return state;
        }

        it('find import makeJayComponent', async () => {
            const code = stripMargin(`import { makeJayComponent } from 'jay-component';`);
            const transformerState = loggingTransformer();
            await transformCode(code, [transformerState.transformer]);
            expect(transformerState.makeJayComponentName).toEqual('makeJayComponent');
        });

        it('find import makeJayComponent with other imports', async () => {
            const code = stripMargin(
                `import { makeJayComponent, two, three } from 'jay-component';`,
            );
            const transformerState = loggingTransformer();
            await transformCode(code, [transformerState.transformer]);
            expect(transformerState.makeJayComponentName).toEqual('makeJayComponent');
        });

        it('find import makeJayComponent with rename', async () => {
            const code = stripMargin(`import { makeJayComponent as two } from 'jay-component';`);
            const transformerState = loggingTransformer();
            await transformCode(code, [transformerState.transformer]);
            expect(transformerState.makeJayComponentName).toEqual('two');
        });

        it('should not find import makeJayComponent from another package', async () => {
            const code = stripMargin(`import { makeJayComponent as two } from 'another package';`);
            const transformerState = loggingTransformer();
            await transformCode(code, [transformerState.transformer]);
            expect(transformerState.makeJayComponentName).not.toBeDefined();
        });

        it('should find import makeJayComponent given multiple imports', async () => {
            const code = stripMargin(
                `import { CounterElementRefs, render } from './generated-element';
                   | import { createEvent, createState, makeJayComponent, Props } from 'jay-component';`,
            );
            const transformerState = loggingTransformer();
            await transformCode(code, [transformerState.transformer]);
            expect(transformerState.makeJayComponentName).toEqual('makeJayComponent');
        });
    });

    it.skip('transform counter component', async () => {
        const folder = 'components/counter';
        await readFileAndTsTransform(folder, [componentSecureFunctionsTransformer()]);
    });
});
