import { extractImportedModules, isRelativeImport } from './ts-utils/extract-imports';
import { JAY_QUERY_WORKER_TRUSTED } from '../generation-utils/runtime-mode';
import { createTsSourceFileFromSource } from './building-blocks/create-ts-source-file-from-source';
import { SourceFileType } from '../generation-utils/source-file-type';

export function generateImportsFileFromTsSource(filename: string, source: string): string {
    const sourceFile = createTsSourceFileFromSource(filename, source);
    return fromImportModules(extractImportedModules(sourceFile));
}

export function generateImportsFileFromJayFile(jayFile: SourceFileType): string {
    return fromImportModules(jayFile.imports.map((link) => link.module));
}

function fromImportModules(modules: string[]): string {
    return modules
        .filter(isRelativeImport)
        .map((module) => `import '${module}${JAY_QUERY_WORKER_TRUSTED}'`)
        .join('\n');
}
