import { JayFile } from '../core/jay-file-types';
import { WithValidations } from '../core/with-validations';
import { parseImportLinks } from '../ts-file/parse-jay-file/parse-import-links';
import { createTsSourceFileFromSource } from '../ts-file/building-blocks/create-ts-source-file-from-source';
import { findComponentConstructorCallsBlock } from '../ts-file/building-blocks/find-component-constructor-calls';
import { getBaseElementName } from '../ts-file/building-blocks/get-base-element-name';

export const MAKE_JAY_TSX_COMPONENT_NAME = 'makeJayTsxComponent';

export function parseTsxFile(filename: string, source: string): WithValidations<JayFile> {
    const sourceFile = createTsSourceFileFromSource(filename, source);
    const imports = parseImportLinks(sourceFile);
    const componentConstructors = findComponentConstructorCallsBlock(
        MAKE_JAY_TSX_COMPONENT_NAME,
        sourceFile,
    );
    return getBaseElementName(MAKE_JAY_TSX_COMPONENT_NAME, componentConstructors).map(
        (baseElementName) =>
            ({
                imports,
                baseElementName,
            }) as JayFile,
    );
}
