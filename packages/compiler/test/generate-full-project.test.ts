import {
    checkValidationErrors,
    generateComponentRefsDefinitionFile,
    generateElementDefinitionFile,
    generateElementFile,
    generateSandboxRootFile,
    parseJayFile,
    prettify,
    RuntimeMode, transformComponent,
} from '../lib';
import {
    readGeneratedNamedFile,
    readNamedSourceJayFile, readPrettifyTextFile,
    readTestFile,
} from './test-utils/file-utils';
import * as ts from 'typescript';
import { transformComponentBridge } from '../lib';
import {
    printTsFile,
    readAndParseJayFile,
    readFileAndGenerateElementBridgeFile,
    readTsSourceFile,
} from './test-utils/ts-compiler-test-utils';
import {promise, requestAnimationFramePattern} from "./ts-basic-analyzers/compiler-patterns-for-testing";
import {FunctionRepositoryBuilder} from "../lib/ts-file/building-blocks/function-repository-builder";

describe('generate full project', () => {
    const relativePath = './test/fixtures/tsconfig.json';

    describe('sandboxed counter', () => {
        describe('sandbox target', () => {
            it('generates sandbox root', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'full-projects/counter/source',
                    'app',
                );
                const parsedFile = checkValidationErrors(
                    parseJayFile(
                        jayFile,
                        'app.jay-html',
                        './test/fixtures/full-projects/counter/source',
                        {},
                    ),
                );
                let sandboxRootFile = generateSandboxRootFile(parsedFile);
                expect(await prettify(sandboxRootFile)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/counter/generated/sandbox',
                        'sandbox-root',
                    ),
                );
            });

            it('generates counter element', async () => {
                const runtimeFile = await readFileAndGenerateElementBridgeFile(
                    'full-projects/counter/source',
                    'counter',
                );
                expect(await prettify(runtimeFile)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/counter/generated/sandbox',
                        'counter.jay-html',
                    ),
                );
            });
        });

        describe('source (dev) target', () => {
            it('generates element definition file', async () => {
                const parsedFile = await readAndParseJayFile(
                    'full-projects/counter/source',
                    'counter',
                );
                let runtimeFile = generateElementDefinitionFile(parsedFile);
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/counter/source',
                        'counter.jay-html.d',
                    ),
                );
            }, 10000);
        });

        describe('main target', () => {
            it('generates app element file', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'full-projects/counter/source',
                    'app',
                );
                let runtimeFile = generateElementFile(
                    checkValidationErrors(
                        parseJayFile(
                            jayFile,
                            'app.jay-html',
                            './test/fixtures/full-projects/counter/source',
                            {},
                        ),
                    ),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/counter/generated/main',
                        'app.jay-html',
                    ),
                );
            });

            it('generates function repository file', async () => {
                const funcRepository = new FunctionRepositoryBuilder();

                let runtimeFile = funcRepository.generateGlobalFile();
                expect(await prettify(runtimeFile.functionRepository)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/counter/generated/main',
                        'function-repository',
                    ),
                );
            });


            it('generates counter element file', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'full-projects/counter/source',
                    'counter',
                );
                let runtimeFile = generateElementFile(
                    checkValidationErrors(
                        parseJayFile(
                            jayFile,
                            'counter.jay-html',
                            './test/fixtures/full-projects/counter/source',
                            {},
                        ),
                    ),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/counter/generated/main',
                        'counter.jay-html',
                    ),
                );
            });

            it('generates counter refs file', async () => {
                let refsFile = generateComponentRefsDefinitionFile(
                    './test/fixtures/full-projects/counter/source/counter',
                    { relativePath },
                );
                expect(refsFile.validations).toEqual([]);
                expect(await prettify(refsFile.val)).toEqual(
                    await prettify(
                        await readTestFile(
                            './full-projects/counter/generated/main',
                            'counter-refs.d.ts',
                        ),
                    ),
                );
            });

            it('generates counter bridge', async () => {
                const sourceFile = await readTsSourceFile(
                    'full-projects/counter/source',
                    'counter.ts',
                );
                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponentBridge(RuntimeMode.MainSandbox, [], globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readTestFile('full-projects/counter/generated/main', 'counter.ts'),
                );
            });
        });
    });

    describe('sandboxed exec$', () => {
        describe('sandbox target', () => {
            it('generates sandbox root', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'full-projects/exec/source',
                    'app',
                );
                const parsedFile = checkValidationErrors(
                    parseJayFile(
                        jayFile,
                        'app.jay-html',
                        './test/fixtures/full-projects/exec/source',
                        {},
                    ),
                );
                let sandboxRootFile = generateSandboxRootFile(parsedFile);
                expect(await prettify(sandboxRootFile)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/exec/generated/sandbox',
                        'sandbox-root',
                    ),
                );
            });

            it('generates counter element', async () => {
                const runtimeFile = await readFileAndGenerateElementBridgeFile(
                    'full-projects/exec/source',
                    'auto-counter',
                );
                expect(await prettify(runtimeFile)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/exec/generated/sandbox',
                        'auto-counter.jay-html',
                    ),
                );
            });

            it('transform counter component', async () => {
                const sourceFile = await readTsSourceFile(
                    'full-projects/exec/source',
                    'auto-counter.ts',
                );

                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponent([...promise(), ...requestAnimationFramePattern()], globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readPrettifyTextFile('full-projects/exec/generated/sandbox', 'auto-counter.ts'),
                );
            });

            it('transform a module', async () => {
                const sourceFile = await readTsSourceFile(
                    'full-projects/exec/source',
                    'a-module.ts',
                );

                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponent([...promise(), ...requestAnimationFramePattern()], globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readPrettifyTextFile('full-projects/exec/generated/sandbox', 'a-module.ts'),
                );
            });
        });

        describe('source (dev) target', () => {
            it('generates element definition file', async () => {
                const parsedFile = await readAndParseJayFile(
                    'full-projects/exec/source',
                    'auto-counter',
                );
                let runtimeFile = generateElementDefinitionFile(parsedFile);
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/exec/source',
                        'auto-counter.jay-html.d',
                    ),
                );
            }, 10000);
        });

        describe('main target', () => {
            it('generates app element file', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'full-projects/exec/source',
                    'app',
                );
                let runtimeFile = generateElementFile(
                    checkValidationErrors(
                        parseJayFile(
                            jayFile,
                            'app.jay-html',
                            './test/fixtures/full-projects/exec/source',
                            {},
                        ),
                    ),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/exec/generated/main',
                        'app.jay-html',
                    ),
                );
            });

            it('generates function repository file', async () => {
                const funcRepository = new FunctionRepositoryBuilder();
                funcRepository.addFunction('() => new Promise((resolve) => requestAnimationFrame(resolve))')
                funcRepository.addFunction('() => new Promise((resolve) => requestAnimationFrame(resolve))')

                let runtimeFile = funcRepository.generateGlobalFile();
                expect(await prettify(runtimeFile.functionRepository)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/exec/generated/main',
                        'function-repository',
                    ),
                );
            });

            it('generates counter element file', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'full-projects/exec/source',
                    'auto-counter',
                );
                let runtimeFile = generateElementFile(
                    checkValidationErrors(
                        parseJayFile(
                            jayFile,
                            'auto-counter.jay-html',
                            './test/fixtures/full-projects/exec/source',
                            {},
                        ),
                    ),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readGeneratedNamedFile(
                        'full-projects/exec/generated/main',
                        'auto-counter.jay-html',
                    ),
                );
            });

            it('generates counter refs file', async () => {
                let refsFile = generateComponentRefsDefinitionFile(
                    './test/fixtures/full-projects/exec/source/auto-counter',
                    { relativePath },
                );
                expect(refsFile.validations).toEqual([]);
                expect(await prettify(refsFile.val)).toEqual(
                    await prettify(
                        await readTestFile(
                            './full-projects/exec/generated/main',
                            'auto-counter-refs.d.ts',
                        ),
                    ),
                );
            });

            it('transform counter bridge', async () => {
                const sourceFile = await readTsSourceFile(
                    'full-projects/exec/source',
                    'auto-counter.ts',
                );

                const globalFunctionRepo = new FunctionRepositoryBuilder();
                const outputFile = ts.transform(sourceFile, [
                    transformComponentBridge(RuntimeMode.MainSandbox, [], globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readTestFile('full-projects/exec/generated/main', 'auto-counter.ts'),
                );
            });
        });
    })
});
