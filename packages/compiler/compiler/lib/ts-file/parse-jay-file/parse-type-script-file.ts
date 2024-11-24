import { WithValidations } from '../../compiler-shared/with-validations';
import { capitalCase } from 'change-case';
import { hasExtension, withoutExtension } from '../../compiler-shared/runtime-mode';
import { JAY_EXTENSION, JAY_TS_EXTENSION } from '../../compiler-shared/constants';
import { parseImportLinks } from './parse-import-links';
import path from 'node:path';
import { createTsSourceFileFromSource } from '../building-blocks/create-ts-source-file-from-source';
import { SourceFileFormat } from '../../compiler-shared/source-file-format';
import { TypeScriptModuleSourceFile } from '../../compiler-shared/source-file-type';

export function parseTypeScriptFile(
    filePath: string,
    code: string,
): WithValidations<TypeScriptModuleSourceFile> {
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
        } as TypeScriptModuleSourceFile,
        [],
    );
}
