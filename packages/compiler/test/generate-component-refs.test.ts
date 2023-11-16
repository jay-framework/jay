import { generateComponentRefsDefinitionFile, prettify } from '../lib';
import { readTestFile } from './test-fs-utils';

describe('generate the refs file', () => {
    it('should support events in refs', async () => {
        let refsFile = generateComponentRefsDefinitionFile(
            './test/fixtures/components/counter/counter',
            { relativePath: './test/fixtures/tsconfig.json' },
        );
        expect(refsFile.validations).toEqual([]);
        expect(await prettify(refsFile.val)).toEqual(
            await readTestFile('./components/counter', 'counter-refs.d.ts'),
        );
    });
});
