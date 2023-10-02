import {
    generateComponentRefsDefinitionFile,
    generateElementBridgeFile,
    generateElementDefinitionFile,
    generateElementFile,
    generateSandboxRootFile,
} from '../lib';
import { describe, expect, it } from '@jest/globals';
import {
    readGeneratedNamedFile,
    readNamedSourceJayFile,
    readTestFile,
} from './test-fs-utils';
import { printTsFile, readExpectedTsFile, readTsSourceFile } from './test-ts-utils.file';
import * as ts from 'typescript';
import { componentBridgeTransformer } from '../lib/ts-file/component-bridge-transformer';

describe('generate full project', () => {
    describe('sandboxed counter', () => {
        describe('sandbox target', () => {
            it('generates sandbox root', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'sandboxed/sandboxed-counter/source',
                    'app',
                );
                let sandboxRootFile = generateSandboxRootFile(
                    jayFile,
                    'app.jay.html',
                    './test/fixtures/sandboxed/sandboxed-counter/source',
                );
                expect(sandboxRootFile.validations).toEqual([]);
                expect(sandboxRootFile.val).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/generated/sandbox',
                        'sandbox-root',
                    ),
                );
            });

            it('generates counter element', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'sandboxed/sandboxed-counter/source',
                    'counter',
                );
                let runtimeFile = generateElementBridgeFile(
                    jayFile,
                    'counter.jay.html',
                    './sandboxed/sandboxed-counter-source',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/generated/sandbox',
                        'counter.jay.html',
                    ),
                );
            });
        });

        describe('source (dev) target', () => {
            it('generates element definition file', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'sandboxed/sandboxed-counter/source',
                    'counter',
                );
                let runtimeFile = generateElementDefinitionFile(
                    jayFile,
                    'counter.jay.html',
                    './sandboxed/sandboxed-counter-source',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/source',
                        'counter.jay.html.d',
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
                    jayFile,
                    'app.jay.html',
                    './test/fixtures/sandboxed/sandboxed-counter/source',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/generated/main',
                        'app.jay.html',
                    ),
                );
            });

            it('generates counter element file', async () => {
                const jayFile = await readNamedSourceJayFile(
                    'sandboxed/sandboxed-counter/source',
                    'counter',
                );
                let runtimeFile = generateElementFile(
                    jayFile,
                    'counter.jay.html',
                    './test/fixtures/sandboxed/sandboxed-counter/source',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedNamedFile(
                        'sandboxed/sandboxed-counter/generated/main',
                        'counter.jay.html',
                    ),
                );
            });

            it('generates counter refs file', async () => {
                let refsFile = generateComponentRefsDefinitionFile(
                    './test/fixtures/sandboxed/sandboxed-counter/source/counter',
                );
                expect(refsFile.validations).toEqual([]);
                expect(refsFile.val).toEqual(
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
                    componentBridgeTransformer(['./counter.jay.html']),
                ]);

                const outputCode = await printTsFile(outputFile);
                expect(outputCode).toEqual(
                    await readExpectedTsFile(
                        'sandboxed/sandboxed-counter/generated/main',
                        'counter.ts',
                    ),
                );
            });
        });
    });
});
