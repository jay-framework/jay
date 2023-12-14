import { readTestFile } from './test-utils/file-utils';
import { readFileAndGenerateComponentSandboxFile } from './test-utils/compiler-utils';

describe('generateComponentSandbox', () => {
    it('transforms counter component', async () => {
        const folder = 'components/counter';
        expect(await readFileAndGenerateComponentSandboxFile(folder)).toEqual(
            await readTestFile(folder, 'generated-component-sandbox.ts'),
        );
    });
});
