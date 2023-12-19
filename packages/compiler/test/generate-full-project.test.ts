import {
    generateComponentRefsDefinitionFile,
    generateElementBridgeFile,
    generateElementDefinitionFile,
    generateElementFile,
    generateSandboxRootFile,
    parseJayFile,
    prettify,
    RuntimeMode,
} from '../lib';
import {
    readGeneratedNamedFile,
    readNamedSourceJayFile,
    readTestFile,

} from './test-utils/file-utils';
import * as ts from 'typescript';
import { componentBridgeTransformer } from '../lib/ts-file/component-bridge-transformer';
import {
    printTsFile,
    readAndParseJayFile,
    readFileAndGenerateElementBridgeFile, readTsSourceFile,
} from './test-utils/ts-compiler-test-utils';

describe('generate full project', () => {
    const relativePath = './test/fixtures/tsconfig.json';

    describe('sandboxed counter', () => {
        describe('sandbox target', () => {
            it('generates sandbox root', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'sandboxed/sandboxed-counter/source',
                    'app',
                );
                const parsedFile = parseJayFile(
                    jayFile,
                    'app.jay-html',
                    './test/fixtures/sandboxed/sandboxed-counter/source',
                );
                let sandboxRootFile = generateSandboxRootFile(parsedFile);
                expect(sandboxRootFile.validations).toEqual([]);
                expect(await prettify(sandboxRootFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/generated/sandbox',
                        'sandbox-root',
                    ),
                );
            });

            it('generates counter element', async () => {
                const runtimeFile = await readFileAndGenerateElementBridgeFile(
                    'sandboxed/sandboxed-counter/source',
                    'counter',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/generated/sandbox',
                        'counter.jay-html',
                    ),
                );
            });
        });

        describe('source (dev) target', () => {
            it('generates element definition file', async () => {
                const parsedFile = await readAndParseJayFile(
                    'sandboxed/sandboxed-counter/source',
                    'counter',
                );
                let runtimeFile = generateElementDefinitionFile(parsedFile);
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/source',
                        'counter.jay-html.d',
                    ),
                );
            }, 10000);
        });

        describe('main target', () => {
            it('generates app element file', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'sandboxed/sandboxed-counter/source',
                    'app',
                );
                let runtimeFile = generateElementFile(
                    parseJayFile(
                        jayFile,
                        'app.jay-html',
                        './test/fixtures/sandboxed/sandboxed-counter/source',
                    ),
                    RuntimeMode.MainSandbox,
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/generated/main',
                        'app.jay-html',
                    ),
                );
            });

            it('generates counter element file', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'sandboxed/sandboxed-counter/source',
                    'counter',
                );
                let runtimeFile = generateElementFile(
                    parseJayFile(
                        jayFile,
                        'counter.jay-html',
                        './test/fixtures/sandboxed/sandboxed-counter/source',
                    ),
                    RuntimeMode.MainSandbox,
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/generated/main',
                        'counter.jay-html',
                    ),
                );
            });

            it('generates counter refs file', async () => {
                let refsFile = generateComponentRefsDefinitionFile(
                    './test/fixtures/sandboxed/sandboxed-counter/source/counter',
                    { relativePath },
                );
                expect(refsFile.validations).toEqual([]);
                expect(await prettify(refsFile.val)).toEqual(
                    await readTestFile(
                        './sandboxed/sandboxed-counter/generated/main',
                        'counter-refs.d.ts',
                    ),
                );
            });

            it('generates counter bridge', async () => {
                const sourceFile = await readTsSourceFile(
                    'sandboxed/sandboxed-counter/source',
                    'counter.ts',
                );

                const outputFile = ts.transform(sourceFile, [
                    componentBridgeTransformer(RuntimeMode.MainSandbox),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readTestFile('sandboxed/sandboxed-counter/generated/main', 'counter.ts'),
                );
            });
        });
    });
});
