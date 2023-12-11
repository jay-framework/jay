import { readTestFile } from './test-utils/file-utils';
import { readFileAndGenerateComponentBridgeFile } from './test-utils/compiler-utils.ts';

describe('generate component bridge', () => {
    it('transform counter component', async () => {
        const folder = 'components/counter';
        expect(await readFileAndGenerateComponentBridgeFile(folder)).toEqual(
            await readTestFile(folder, 'generated-component-bridge.ts'),
        );
    });

    describe('for renamed render', () => {
        const folder = 'components/counter';

        it('preserves the renamed value', async () => {
            expect(
                await readFileAndGenerateComponentBridgeFile(folder, 'counter-render-renamed.ts'),
            ).toEqual(await readTestFile(folder, 'generated-component-bridge-render-renamed.ts'));
        });
    });
});
