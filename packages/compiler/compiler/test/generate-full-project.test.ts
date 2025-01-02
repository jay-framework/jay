import {
    generateElementDefinitionFile,
    generateElementFile,
    transformComponent,
} from '../lib';
import {
    readFixtureFile,
    readFixtureSourceJayFile,
    readFixtureFileRaw,
} from './test-utils/file-utils';
import * as ts from 'typescript';
import { transformComponentBridge } from '../lib';
import {
    printTsFile,
    readAndParseJayFile,
    readFileAndGenerateElementBridgeFile,
    readTsSourceFile,
} from './test-utils/ts-compiler-test-utils';
import {
    eventPreventDefaultPattern,
    promise,
    readCheckedPattern,
    readEventKeyCodePattern,
    readEventTargetValuePattern,
    readEventWhichPattern,
    requestAnimationFramePattern,
} from './component-files/ts-basic-analyzers/compiler-patterns-for-testing';
import { FunctionRepositoryBuilder } from '../lib';
import { checkValidationErrors, prettify, RuntimeMode } from 'jay-compiler-shared';
import { generateSandboxRootFile, parseJayFile } from 'jay-compiler-jay-html';

describe('generate full project', () => {
    const relativePath = './test/fixtures/tsconfig.json';

    describe('sandboxed counter', () => {
        const FIXTURE_PROJECT = `full-projects/counter`;
        const FIXTURE_SOURCE = `${FIXTURE_PROJECT}/source`;
        const FIXTURE_SANDBOX = `${FIXTURE_PROJECT}/generated/sandbox`;
        const FIXTURE_MAIN = `${FIXTURE_PROJECT}/generated/main`;
        const SOURCE = './test/fixtures/full-projects/counter/source';

        describe('sandbox target', () => {
            it('generates sandbox root', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'app');
                const parsedFile = checkValidationErrors(
                    parseJayFile(jayFile, 'app.jay-html', SOURCE, {}),
                );
                let sandboxRootFile = generateSandboxRootFile(parsedFile);
                expect(await prettify(sandboxRootFile)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'sandbox-root'),
                );
            });

            it('generates counter element', async () => {
                const runtimeFile = await readFileAndGenerateElementBridgeFile(
                    FIXTURE_SOURCE,
                    'counter',
                );
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'counter.jay-html'),
                );
            });
        });

        describe('source (dev) target', () => {
            it('generates element definition file', async () => {
                const parsedFile = await readAndParseJayFile(FIXTURE_SOURCE, 'counter');
                let runtimeFile = generateElementDefinitionFile(parsedFile);
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_SOURCE, 'counter.jay-html.d'),
                );
            }, 10000);
        });

        describe('main target', () => {
            it('generates app element file', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'app');
                let runtimeFile = generateElementFile(
                    checkValidationErrors(parseJayFile(jayFile, 'app.jay-html', SOURCE, {})),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'app.jay-html'),
                );
            });

            it('generates function repository file', async () => {
                const funcRepository = new FunctionRepositoryBuilder();

                let runtimeFile = funcRepository.generateGlobalFile();
                expect(await prettify(runtimeFile.functionRepository)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'function-repository'),
                );
            });

            it('generates counter element file', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'counter');
                let runtimeFile = generateElementFile(
                    checkValidationErrors(parseJayFile(jayFile, 'counter.jay-html', SOURCE, {})),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'counter.jay-html'),
                );
            });

            it('generates counter bridge', async () => {
                const sourceFile = await readTsSourceFile(FIXTURE_SOURCE, 'counter');
                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponentBridge(RuntimeMode.MainSandbox, [], globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'counter'),
                );
            });
        });
    });

    describe('sandboxed exec$', () => {
        const FIXTURE_PROJECT = `full-projects/exec`;
        const FIXTURE_SOURCE = `${FIXTURE_PROJECT}/source`;
        const FIXTURE_SANDBOX = `${FIXTURE_PROJECT}/generated/sandbox`;
        const FIXTURE_MAIN = `${FIXTURE_PROJECT}/generated/main`;
        const SOURCE = './test/fixtures/full-projects/exec/source';
        describe('sandbox target', () => {
            it('generates sandbox root', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'app');
                const parsedFile = checkValidationErrors(
                    parseJayFile(jayFile, 'app.jay-html', SOURCE, {}),
                );
                let sandboxRootFile = generateSandboxRootFile(parsedFile);
                expect(await prettify(sandboxRootFile)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'sandbox-root'),
                );
            });

            it('generates counter element', async () => {
                const runtimeFile = await readFileAndGenerateElementBridgeFile(
                    FIXTURE_SOURCE,
                    'auto-counter',
                );
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'auto-counter.jay-html'),
                );
            });

            it('transform counter component', async () => {
                const sourceFile = await readTsSourceFile(FIXTURE_SOURCE, 'auto-counter');

                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponent(
                        [...promise(), ...requestAnimationFramePattern()],
                        globalFunctionRepo,
                    ),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'auto-counter'),
                );
            });

            it('transform a module', async () => {
                const sourceFile = await readTsSourceFile(FIXTURE_SOURCE, 'a-module');

                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponent(
                        [...promise(), ...requestAnimationFramePattern()],
                        globalFunctionRepo,
                    ),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'a-module'),
                );
            });
        });

        describe('source (dev) target', () => {
            it('generates element definition file', async () => {
                const parsedFile = await readAndParseJayFile(FIXTURE_SOURCE, 'auto-counter');
                let runtimeFile = generateElementDefinitionFile(parsedFile);
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_SOURCE, 'auto-counter.jay-html.d'),
                );
            }, 10000);
        });

        describe('main target', () => {
            it('generates app element file', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'app');
                let runtimeFile = generateElementFile(
                    checkValidationErrors(parseJayFile(jayFile, 'app.jay-html', SOURCE, {})),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'app.jay-html'),
                );
            });

            it('generates function repository file', async () => {
                const funcRepository = new FunctionRepositoryBuilder();
                funcRepository.addFunction(
                    '() => new Promise((resolve) => requestAnimationFrame(resolve))',
                );
                funcRepository.addFunction(
                    '() => new Promise((resolve) => requestAnimationFrame(resolve))',
                );

                let runtimeFile = funcRepository.generateGlobalFile();
                expect(await prettify(runtimeFile.functionRepository)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'function-repository'),
                );
            });

            it('generates counter element file', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'auto-counter');
                let runtimeFile = generateElementFile(
                    checkValidationErrors(
                        parseJayFile(jayFile, 'auto-counter.jay-html', SOURCE, {}),
                    ),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'auto-counter.jay-html'),
                );
            });

            it('transform counter bridge', async () => {
                const sourceFile = await readTsSourceFile(FIXTURE_SOURCE, 'auto-counter');

                const globalFunctionRepo = new FunctionRepositoryBuilder();
                const outputFile = ts.transform(sourceFile, [
                    transformComponentBridge(RuntimeMode.MainSandbox, [], globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readFixtureFileRaw(FIXTURE_MAIN, 'auto-counter.ts'),
                );
            });
        });
    });

    describe('sandboxed todo', () => {
        const FIXTURE_PROJECT = `full-projects/todo`;
        const FIXTURE_SOURCE = `${FIXTURE_PROJECT}/source`;
        const FIXTURE_SANDBOX = `${FIXTURE_PROJECT}/generated/sandbox`;
        const FIXTURE_MAIN = `${FIXTURE_PROJECT}/generated/main`;
        const SOURCE = './test/fixtures/full-projects/todo/source';
        const PATTERNS = [
            ...readEventTargetValuePattern(),
            ...readCheckedPattern(),
            ...readEventKeyCodePattern(),
            ...readEventWhichPattern(),
            ...eventPreventDefaultPattern(),
        ];

        describe('sandbox target', () => {
            it('generates sandbox root', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'app');
                const parsedFile = checkValidationErrors(
                    parseJayFile(jayFile, 'app.jay-html', SOURCE, {}),
                );
                let sandboxRootFile = generateSandboxRootFile(parsedFile);
                expect(await prettify(sandboxRootFile)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'sandbox-root'),
                );
            });

            it('transform todo component', async () => {
                const sourceFile = await readTsSourceFile(FIXTURE_SOURCE, 'todo');

                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponent(PATTERNS, globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'todo'),
                );
            });

            it('generates todo element', async () => {
                const runtimeFile = await readFileAndGenerateElementBridgeFile(
                    FIXTURE_SOURCE,
                    'todo',
                );
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'todo.jay-html'),
                );
            });

            it('transform item component', async () => {
                const sourceFile = await readTsSourceFile(FIXTURE_SOURCE, 'item');

                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponent(PATTERNS, globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'item'),
                );
            });

            it('generates item element', async () => {
                const runtimeFile = await readFileAndGenerateElementBridgeFile(
                    FIXTURE_SOURCE,
                    'item',
                );
                expect(await prettify(runtimeFile)).toEqual(
                    await readFixtureFile(FIXTURE_SANDBOX, 'item.jay-html'),
                );
            });
        });

        describe('source (dev) target', () => {
            it('generates todo element definition file', async () => {
                const parsedFile = await readAndParseJayFile(FIXTURE_SOURCE, 'todo');
                let runtimeFile = generateElementDefinitionFile(parsedFile);
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_SOURCE, 'todo.jay-html.d'),
                );
            }, 10000);

            it('generates item element definition file', async () => {
                const parsedFile = await readAndParseJayFile(FIXTURE_SOURCE, 'item');
                let runtimeFile = generateElementDefinitionFile(parsedFile);
                expect(runtimeFile.validations).toEqual([]);
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_SOURCE, 'item.jay-html.d'),
                );
            }, 10000);
        });

        describe('main target', () => {
            it('generates app element file', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'app');
                let runtimeFile = generateElementFile(
                    checkValidationErrors(parseJayFile(jayFile, 'app.jay-html', SOURCE, {})),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'app.jay-html'),
                );
            });

            it('generates function repository file', async () => {
                const funcRepository = new FunctionRepositoryBuilder();

                let runtimeFile = funcRepository.generateGlobalFile();
                expect(await prettify(runtimeFile.functionRepository)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'function-repository'),
                );
            });

            it('generates todo element file', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'todo');
                let runtimeFile = generateElementFile(
                    checkValidationErrors(parseJayFile(jayFile, 'todo.jay-html', SOURCE, {})),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'todo.jay-html'),
                );
            });

            it('generates todo bridge', async () => {
                const sourceFile = await readTsSourceFile(FIXTURE_SOURCE, 'todo');
                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponentBridge(RuntimeMode.MainSandbox, PATTERNS, globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'todo'),
                );
            });

            it('generates item element file', async () => {
                const jayFile = await readFixtureSourceJayFile(FIXTURE_SOURCE, 'item');
                let runtimeFile = generateElementFile(
                    checkValidationErrors(parseJayFile(jayFile, 'item.jay-html', SOURCE, {})),
                    RuntimeMode.MainSandbox,
                );
                expect(await prettify(runtimeFile.val)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'item.jay-html'),
                );
            });

            it('generates item bridge', async () => {
                const sourceFile = await readTsSourceFile(FIXTURE_SOURCE, 'item');
                const globalFunctionRepo = new FunctionRepositoryBuilder();

                const outputFile = ts.transform(sourceFile, [
                    transformComponentBridge(RuntimeMode.MainSandbox, PATTERNS, globalFunctionRepo),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(await prettify(outputCode)).toEqual(
                    await readFixtureFile(FIXTURE_MAIN, 'item'),
                );
            });
        });
    });
});
