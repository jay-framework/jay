import {
    readFileAndGenerateImportsFileFromJayFile,
    readFileAndGenerateImportsFileFromTsFile,
} from './test-utils/compiler-utils';
import { prettify } from '../lib';
import { readGeneratedNamedFile } from './test-utils/file-utils';

describe('generateImportsFileFromTsFile', () => {
    describe('counter', () => {
        it('should return source with relative import statements only', async () => {
            const folder = 'components/counter';
            const output = await readFileAndGenerateImportsFileFromTsFile(folder);
            expect(output).toEqual(
                await prettify(await readGeneratedNamedFile(folder, 'generated-imports-file')),
            );
        });
    });
});

describe('generateImportsFileFromJayFile', () => {
    describe('component-in-component', () => {
        it('should return source with relative import statements only', async () => {
            const folder = 'components/component-in-component';
            const output = await readFileAndGenerateImportsFileFromJayFile(folder);
            expect(output).toEqual(
                await prettify(await readGeneratedNamedFile(folder, 'generated-imports-file')),
            );
        });
    });
});
