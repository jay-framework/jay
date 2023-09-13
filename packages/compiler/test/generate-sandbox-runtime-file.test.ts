import {generateSandboxRuntimeFile} from '../lib';
import {describe, expect, it} from '@jest/globals'
import {
    readGeneratedElementBridgeFile,
    readSourceJayFile
} from "./test-fs-utils";

describe('generate the sandbox runtime file', () => {
    describe('basics', () => {
        it('for an empty element', async () => {
            const jayFile = await readSourceJayFile('basics/empty-element');
            let runtimeFile = generateSandboxRuntimeFile(jayFile, 'empty-element.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementBridgeFile('basics/empty-element'));
        })

        it('for simple file with dynamic text', async () => {
            const jayFile = await readSourceJayFile('basics/simple-dynamic-text');
            let runtimeFile = generateSandboxRuntimeFile(jayFile, 'simple-dynamic-text.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementBridgeFile('basics/simple-dynamic-text'));
        })

        it('for simple file refs', async () => {
            const jayFile = await readSourceJayFile('basics/refs');
            let runtimeFile = generateSandboxRuntimeFile(jayFile, 'refs.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementBridgeFile('basics/refs'));
        })
    })

    describe('components', () => {
        it('counter component', async () => {
            const jayFile = await readSourceJayFile('components/counter');
            let runtimeFile = generateSandboxRuntimeFile(jayFile, 'counter.jay.html', './test/');
            expect(runtimeFile.validations).toEqual([]);
            expect(runtimeFile.val).toEqual(await readGeneratedElementBridgeFile('components/counter'));
        })
    })

})

