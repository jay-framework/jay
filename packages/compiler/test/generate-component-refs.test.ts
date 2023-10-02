import { generateComponentRefsDefinitionFile } from '../lib';
import { describe, expect, it } from '@jest/globals';
import { readTestFile } from './test-fs-utils';

describe('generate the refs file', () => {
    it('should support events in refs', async () => {
        let refsFile = generateComponentRefsDefinitionFile(
            './test/fixtures/components/counter/counter',
        );
        expect(refsFile.validations).toEqual([]);
        expect(refsFile.val).toEqual(
            await readTestFile('./components/counter', 'counter-refs.d.ts'),
        );
    });
});
