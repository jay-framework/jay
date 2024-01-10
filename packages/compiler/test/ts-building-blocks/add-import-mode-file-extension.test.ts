import { mkTransformer } from '../../lib/ts-file/mk-transformer';
import ts, { isImportDeclaration } from 'typescript';
import { transformCode } from '../test-utils/ts-compiler-test-utils';
import { prettify, RuntimeMode } from '../../lib';
import { addImportModeFileExtension } from '../../lib/ts-file/building-blocks/add-import-mode-file-extension';

describe('add event handler call$ to call chain', () => {
    function testTransformer(importerMode: RuntimeMode) {
        return mkTransformer(({ context, sourceFile, factory }) => {
            return ts.visitEachChild(
                sourceFile,
                (statement) => {
                    if (isImportDeclaration(statement)) {
                        return addImportModeFileExtension(statement, factory, importerMode);
                    }
                    return statement;
                },
                context,
            );
        });
    }

    it('should add runtime mode `WorkerSandbox` to relative import statement', async () => {
        const eventHandlerCall = `import bla from './some-module'`;
        const transformerState = testTransformer(RuntimeMode.WorkerSandbox);
        let transformed = await transformCode(eventHandlerCall, [transformerState]);

        expect(transformed).toEqual(
            await prettify(`import bla from './some-module?jay-workerSandbox'`),
        );
    });

    it('should not add runtime mode `WorkerSandbox` to absolute import statement', async () => {
        const eventHandlerCall = `import bla from 'some-module'`;
        const transformerState = testTransformer(RuntimeMode.WorkerSandbox);
        let transformed = await transformCode(eventHandlerCall, [transformerState]);

        expect(transformed).toEqual(await prettify(`import bla from 'some-module'`));
    });

    it('should add runtime mode `WorkerTrusted` to absolute import statement', async () => {
        const eventHandlerCall = `import bla from './some-module'`;
        const transformerState = testTransformer(RuntimeMode.WorkerTrusted);
        let transformed = await transformCode(eventHandlerCall, [transformerState]);

        expect(transformed).toEqual(
            await prettify(`import bla from './some-module?jay-workerSandbox'`),
        );
    });
});
