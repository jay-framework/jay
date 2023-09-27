import {generateElementBridgeFile, generateSandboxRootFile} from '../lib';
import { describe, expect, it } from '@jest/globals';
import {
    readGeneratedElementBridgeFile,
    readGeneratedNamedFile,
    readNamedSourceJayFile,
    readSourceJayFile
} from './test-fs-utils';

describe('generate the element sandbox files', () => {
    describe('generate element bridges', () => {
        describe('basic', () => {
            it('for an empty element', async () => {
                const jayFile = await readSourceJayFile('basics/empty-element');
                let runtimeFile = generateElementBridgeFile(
                    jayFile,
                    'empty-element.jay.html',
                    './test/',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedElementBridgeFile('basics/empty-element'),
                );
            });

            it('for simple file with dynamic text', async () => {
                const jayFile = await readSourceJayFile('basics/simple-dynamic-text');
                let runtimeFile = generateElementBridgeFile(
                    jayFile,
                    'simple-dynamic-text.jay.html',
                    './test/',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedElementBridgeFile('basics/simple-dynamic-text'),
                );
            });

            it('for simple file refs', async () => {
                const jayFile = await readSourceJayFile('basics/refs');
                let runtimeFile = generateElementBridgeFile(jayFile, 'refs.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(await readGeneratedElementBridgeFile('basics/refs'));
            });

        });

        describe('components', () => {
            it('counter component', async () => {
                const jayFile = await readSourceJayFile('components/counter');
                let runtimeFile = generateElementBridgeFile(jayFile, 'counter.jay.html', './test/');
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedElementBridgeFile('components/counter'),
                );
            });

            it('component in component', async () => {
                const jayFile = await readSourceJayFile('components/component-in-component');
                let runtimeFile = generateElementBridgeFile(
                    jayFile,
                    'component-in-component.jay.html',
                    './test/fixtures/components/component-in-component',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedElementBridgeFile('components/component-in-component'),
                );
            });

            it('dynamic component in component', async () => {
                const jayFile = await readSourceJayFile('components/dynamic-component-in-component');
                let runtimeFile = generateElementBridgeFile(
                    jayFile,
                    'dynamic-component-in-component.jay.html',
                    './test/fixtures/components/dynamic-component-in-component',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedElementBridgeFile('components/dynamic-component-in-component'),
                );
            });
        });

        describe('collections', () => {
            it('component in component', async () => {
                const jayFile = await readSourceJayFile('collections/collection-with-refs');
                let runtimeFile = generateElementBridgeFile(
                    jayFile,
                    'collection-with-refs.jay.html',
                    './test/fixtures/collections/collection-with-refs',
                );
                expect(runtimeFile.validations).toEqual([]);
                expect(runtimeFile.val).toEqual(
                    await readGeneratedElementBridgeFile('collections/collection-with-refs'),
                );
            });
        });
    });

    describe('generate sandbox root', () => {
        it('generate sandbox root for a simple case', async () => {
            const jayFile = await readNamedSourceJayFile('sandboxed/sandboxed-counter', 'app');
            let sandboxRootFile = generateSandboxRootFile(
                jayFile,
                'app.jay.html',
                './test/fixtures/sandboxed/sandboxed-counter',
            );
            expect(sandboxRootFile.validations).toEqual([]);
            expect(sandboxRootFile.val).toEqual(
                await readGeneratedNamedFile('sandboxed/sandboxed-counter', 'generated-sandbox-root'),
            );
        })
    })
});
