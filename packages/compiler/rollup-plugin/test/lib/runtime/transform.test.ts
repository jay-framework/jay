import { mock } from 'vitest-mock-extended';
import { PluginContext, SourceDescription, TransformResult } from 'rollup';
import path from 'node:path';
import {
    JAY_QUERY_MAIN_SANDBOX,
    JAY_QUERY_WORKER_TRUSTED_TS,
    JayAtomicType,
    JayFormat,
    JayObjectType,
    JayUnknown,
    prettify,
    TS_EXTENSION,
} from 'jay-compiler';
import { JayPluginContext } from '../../../lib';
import { getGeneratedCode, readTestFile } from '../../test-utils/file-utils';
import { JayMetadata } from '../../../lib/runtime/metadata';
import { transformJayFile } from '../../../lib/runtime/transform';
import { getJayFileStructure } from '../../../lib/runtime/get-jay-file-structure';
import { removeComments } from '../../../../compiler/lib/utils/prettify';

describe('transformJayFile', () => {
    const jayContext = new JayPluginContext();
    const projectRoot = 'jayRuntime/fixtures/counter';
    const folder = 'jayRuntime/fixtures/counter/source';

    const getContext = ({ jay }) =>
        mock<PluginContext>({
            getModuleInfo: vi.fn().mockReturnValue({ meta: { jay } }),
            getWatchFiles: vi.fn().mockReturnValue([]),
        });

    const readGeneratedFile = (filePath: string, id: string, context: string): string =>
        readTestFile(
            path.dirname(filePath.replace('/source/', `/generated/${context}/`)),
            path.basename(id),
        ).code;

    const prettified = async (result: TransformResult): Promise<string> =>
        await prettify((result as Partial<SourceDescription>).code);

    const filename = 'app.jay-html';
    const { code, filePath } = readTestFile(folder, filename);
    const id = `${filePath}.ts`;
    const jay: JayMetadata = { originId: filePath, format: JayFormat.JayHtml };

    it('returns generated code', async () => {
        const context = getContext({ jay });
        const result = await transformJayFile(jayContext, context, code, id);
        expect(await prettified(result)).toEqual(
            // await getGeneratedCode(projectRoot, filename + '.ts', false)
            await prettify(removeComments(readGeneratedFile(filePath, id, 'main'))),
        );
        expect(jayContext.getCachedJayFile(filePath)).toMatchObject({
            baseElementName: 'App',
            types: new JayObjectType('AppViewState', {
                incrementBy: new JayAtomicType('number'),
            }),
        });
    });

    describe('for mainSandbox mode', () => {
        const filename = 'counter.jay-html';
        const { code, filePath } = readTestFile(folder, filename);
        const id = `${filePath}${JAY_QUERY_MAIN_SANDBOX}${TS_EXTENSION}`;
        const jay: JayMetadata = { originId: filePath, format: JayFormat.JayHtml };

        it('generates element file', async () => {
            const context = getContext({ jay });
            const result = await transformJayFile(jayContext, context, code, id);

            expect(await prettified(result)).toEqual(readGeneratedFile(filePath, id, 'main'));
        });
    });

    describe('for typescript file', () => {
        const { code, filePath } = readTestFile(folder, 'counter.ts');
        const id = filePath;
        const jay: JayMetadata = { originId: filePath, format: JayFormat.TypeScript };

        it('returns the file code', async () => {
            const context = getContext({ jay });
            const result = await transformJayFile(jayContext, context, code, id);

            expect(await prettified(result)).toEqual(code);
            expect(jayContext.getCachedJayFile(id)).toEqual({
                format: JayFormat.TypeScript,
                baseElementName: 'Counter',
                imports: [
                    {
                        module: './counter.jay-html',
                        names: [
                            { name: 'render', type: JayUnknown },
                            { name: 'CounterElementRefs', type: JayUnknown },
                        ],
                        sandbox: false,
                    },
                    {
                        module: 'jay-component',
                        names: [
                            { name: 'createSignal', type: JayUnknown },
                            { name: 'makeJayComponent', type: JayUnknown },
                            { name: 'Props', type: JayUnknown },
                        ],
                        sandbox: false,
                    },
                ],
            });
        });

        describe('for manually written *.ts file', () => {
            const jay = {};

            it('returns null', async () => {
                const context = getContext({ jay });
                expect(await transformJayFile(jayContext, context, code, id)).toBeNull();
            });
        });
    });

    describe('for origin file with already resolved jayFile', () => {
        const filename = 'app.jay-html';
        const { code, filePath } = readTestFile(folder, filename);
        const id = `${filePath}.ts`;
        const jay: JayMetadata = { originId: filePath, format: JayFormat.JayHtml };
        const jayContext = new JayPluginContext();

        it('uses the jayFile', async () => {
            const context = getContext({ jay });
            const { jayFile } = await getJayFileStructure(jayContext, context, code, id);
            jayContext.cacheJayFile(jay.originId, jayFile);
            const result = await transformJayFile(jayContext, context, 'ignored', id);

            expect(await prettified(result)).toEqual(
                await prettify(removeComments(readGeneratedFile(filePath, id, 'main'))),
            );
        });
    });

    describe('for worker root file', () => {
        const { code, filePath } = readTestFile(folder, `sandbox-root.ts`);
        const id = path.resolve(
            path.dirname(filePath),
            `sandbox-root.ts${JAY_QUERY_WORKER_TRUSTED_TS}`,
        );
        const jay: JayMetadata = {
            originId: filePath,
            format: JayFormat.TypeScript,
            isWorkerRoot: true,
        };

        it('updates imports to worker specific ones', async () => {
            const context = getContext({ jay });
            const result = await transformJayFile(jayContext, context, code, id);

            expect(await prettified(result)).toEqual(readGeneratedFile(filePath, id, 'worker'));
        });
    });
});
