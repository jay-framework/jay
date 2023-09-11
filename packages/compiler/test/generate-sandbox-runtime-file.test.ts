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
    })
})

