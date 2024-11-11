import { generateComponentRefsDefinitionFile, prettify } from '../lib';
import { readFixtureFileRaw } from './test-utils/file-utils';

describe('generate the refs file', () => {
    it('should support events in refs', async () => {
        let refsFile = generateComponentRefsDefinitionFile(
            './test/fixtures/components/counter/counter',
            { relativePath: './test/fixtures/tsconfig.json' },
        );
        expect(refsFile.validations).toEqual([]);
        expect(await prettify(refsFile.val)).toEqual(
            await prettify(await readFixtureFileRaw('./components/counter', 'counter-refs.d.ts')),
        );
    });
});
