import {describe, expect, it} from '@jest/globals'
import * as ts from "typescript";
import {componentBridgeTransformer} from "../lib/ts-file/component-bridge-transformer";
import {formatTypescript, printTsFile, readExpectedTsFile, readTsSourceFile} from "./test-ts-utils.file";

describe('generate component bridge', () => {
    const transformers: ts.CustomTransformers = { before: [componentBridgeTransformer] };
    const compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.ES2017 };

    it('transform counter component', async () => {
        const sourceFile = await readTsSourceFile('components/counter', 'counter.ts');

        const outputFile = ts.transform(sourceFile, [componentBridgeTransformer]);

        const outputCode = await printTsFile(outputFile);
        expect(outputCode).toEqual(await readExpectedTsFile('components/counter', 'generated-component-bridge.ts'));
    });

})


