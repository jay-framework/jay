import { extractImportedModules } from '../../lib/ts-file/extract-imports';
import { JAY_QUERY_MAIN_SANDBOX } from '../../lib';
import { createTsSourceFileFromSource } from '../../lib/ts-file/building-blocks/create-ts-source-file-from-source';

describe('extractImports', () => {
    const filePath = '/root/src/index.ts';
    const importSameDir = './import-same-dir';
    const importDeeperDir = `./utils/import-deeper-dir${JAY_QUERY_MAIN_SANDBOX}`;
    const sourceCode = `
      import { foo } from "${importSameDir}";
      import { bar as zed } from "${importDeeperDir}";
      
      const a: string = 'a';
      
      export function doSomething() {
        return a + foo() + bar();
      }
    `;
    const sourceFile = createTsSourceFileFromSource(filePath, sourceCode);

    describe('extractImportedModules', () => {
        it('returns an array of imported modules', () => {
            expect(extractImportedModules(sourceFile)).toEqual([importSameDir, importDeeperDir]);
        });
    });
});
