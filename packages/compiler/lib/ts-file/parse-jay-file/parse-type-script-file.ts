import { WithValidations } from '../../core/with-validations';
import { JayTypeScriptFile } from '../../core/jay-file-types';
import { capitalCase } from 'change-case';
import { hasExtension, withoutExtension } from '../../core/runtime-mode';
import { JAY_EXTENSION, JAY_TS_EXTENSION } from '../../core/constants';
import { parseImportLinks } from './parse-import-links';
import path from 'node:path';
import { createTsSourceFileFromSource } from '../building-blocks/create-ts-source-file-from-source';
import { JayFormat } from '../../core/jay-format';

export function parseTypeScriptFile(
    filePath: string,
    code: string,
): WithValidations<JayTypeScriptFile> {
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
            format: JayFormat.TypeScript,
            imports,
            baseElementName,
        } as JayTypeScriptFile,
        [],
    );
}
