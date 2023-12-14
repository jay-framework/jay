import { WithValidations } from '../core/with-validations';
import { JayFile } from '../core/jay-file-types';
import { extractImportedModules, isRelativeImport } from './extract-imports';
import { JAY_QUERY_WORKER_TRUSTED } from '../core/runtime-mode.ts';

export function generateImportsFileFromTsSource(filename: string, source: string): string {
    return fromImportModules(extractImportedModules(filename, source));
}

export function generateImportsFileFromJayFile(parsedFile: WithValidations<JayFile>): string {
    return fromImportModules(parsedFile.val.imports.map((link) => link.module));
}

function fromImportModules(modules: string[]): string {
    return modules
        .filter(isRelativeImport)
        .map((module) => `import '${module}${JAY_QUERY_WORKER_TRUSTED}'`)
        .join('\n');
}
