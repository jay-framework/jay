import { extractImportedModules, isRelativeImport } from './extract-imports';
import { JAY_QUERY_WORKER_TRUSTED } from '../core/runtime-mode';
import { createTsSourceFileFromSource } from './building-blocks/create-ts-source-file-from-source';
import { JayFile } from '../core/jay-file';

export function generateImportsFileFromTsSource(filename: string, source: string): string {
    const sourceFile = createTsSourceFileFromSource(filename, source);
    return fromImportModules(extractImportedModules(sourceFile));
}

export function generateImportsFileFromJayFile(jayFile: JayFile): string {
    return fromImportModules(jayFile.imports.map((link) => link.module));
}

function fromImportModules(modules: string[]): string {
    return modules
        .filter(isRelativeImport)
        .map((module) => `import '${module}${JAY_QUERY_WORKER_TRUSTED}'`)
        .join('\n');
}
