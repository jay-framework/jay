import * as ts from 'typescript';
import { componentBridgeTransformer } from '../lib/ts-file/component-bridge-transformer';
import { printTsFile, readTsSourceFile } from './test-ts-utils.file';
import { prettify } from '../lib';
import { readTestFile } from './test-fs-utils';

describe('generate component bridge', () => {
    it('transform counter component', async () => {
        const sourceFile = await readTsSourceFile('components/counter', 'counter.ts');

        const outputFile = ts.transform(sourceFile, [
            componentBridgeTransformer(['./generated-element']),
        ]);

        const outputCode = await prettify(await printTsFile(outputFile));
        expect(outputCode).toEqual(
            await readTestFile('components/counter', 'generated-component-bridge.ts'),
        );
    });
});
