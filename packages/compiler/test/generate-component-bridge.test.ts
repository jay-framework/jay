import * as ts from 'typescript';
import { componentBridgeTransformer } from '../lib/ts-file/component-bridge-transformer';
import { printTsFile, readTestFile, readTsSourceFile } from './test-utils/file-utils';
import { prettify, RuntimeMode } from '../lib';

describe('generate component bridge', () => {
    it('transform counter component', async () => {
        const sourceFile = await readTsSourceFile('components/counter', 'counter.ts');

        const outputFile = ts.transform(sourceFile, [
            componentBridgeTransformer(RuntimeMode.SandboxMain),
        ]);

        const outputCode = await prettify(await printTsFile(outputFile));
        expect(outputCode).toEqual(
            await readTestFile('components/counter', 'generated-component-bridge.ts'),
        );
    });
});
