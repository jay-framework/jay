import { extractImportedModules } from '../../lib/ts-file/extract-imports';

describe('extractImportedModules', () => {
    const filePath = '/root/src/index.ts';
    const importSameDir = './import-same-dir';
    const importDeeperDir = './utils/import-deeper-dir';
    const sourceCode = `
      import { foo } from "${importSameDir}";
      import { bar } from "${importDeeperDir}";
      
      const a: string = 'a';
      
      export function doSomething() {
        return a + foo() + bar();
      }
    `;

    it('should return an array of imported modules', () => {
        expect(extractImportedModules(filePath, sourceCode)).toEqual([
            importSameDir,
            importDeeperDir,
        ]);
    });
});
