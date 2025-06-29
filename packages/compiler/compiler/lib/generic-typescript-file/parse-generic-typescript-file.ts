import { WithValidations } from '@jay-framework/compiler-shared';
import { capitalCase } from 'change-case';
import { hasExtension, withoutExtension } from '@jay-framework/compiler-shared';
import { JAY_EXTENSION, JAY_TS_EXTENSION } from '@jay-framework/compiler-shared';
import { parseImportLinks } from '../components-files/building-blocks/parse-import-links';
import path from 'node:path';
import { createTsSourceFileFromSource } from '../components-files/building-blocks/create-ts-source-file-from-source';
import { SourceFileFormat } from '@jay-framework/compiler-shared';
import { GenericTypescriptSourceFile } from '@jay-framework/compiler-shared';

export function parseGenericTypescriptFile(
    filePath: string,
    code: string,
): WithValidations<GenericTypescriptSourceFile> {
    const sourceFile = createTsSourceFileFromSource(filePath, code);
    const imports = parseImportLinks(sourceFile);
    const filename = path.basename(filePath);
    const baseElementName = capitalCase(
        hasExtension(filename, JAY_EXTENSION)
            ? withoutExtension(filename, JAY_TS_EXTENSION)
            : filename.split('.').shift(),
        { delimiter: '' },
    );
    return new WithValidations(
        {
            format: SourceFileFormat.TypeScript,
            imports,
            baseElementName,
        } as GenericTypescriptSourceFile,
        [],
    );
}
