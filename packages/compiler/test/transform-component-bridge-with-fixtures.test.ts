import { readFixtureFileRaw } from './test-utils/file-utils';
import { readFileAndGenerateComponentBridgeFile } from './test-utils/ts-compiler-test-utils';

describe('transform component bridge with fixtures', () => {
    it('transform counter component', async () => {
        const folder = 'components/counter';
        expect(await readFileAndGenerateComponentBridgeFile(folder)).toEqual(
            await readFixtureFileRaw(folder, 'generated-component-bridge.ts'),
        );
    });

    describe('for renamed render', () => {
        const folder = 'components/counter';

        it('preserves the renamed value', async () => {
            expect(
                await readFileAndGenerateComponentBridgeFile(folder, 'counter-render-renamed'),
            ).toEqual(
                await readFixtureFileRaw(folder, 'generated-component-bridge-render-renamed.ts'),
            );
        });
    });
});
