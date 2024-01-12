import { JayFile } from '../core/jay-file-types';
import { WithValidations } from '../core/with-validations';
import { getImportByName, parseImportLinks } from '../ts-file/parse-jay-file/parse-import-links';
import { createTsSourceFileFromSource } from '../ts-file/building-blocks/create-ts-source-file-from-source';
import { findComponentConstructorCallsBlock } from '../ts-file/building-blocks/find-component-constructor-calls';
import { getBaseElementName } from '../ts-file/building-blocks/get-base-element-name';
import { JAY_COMPONENT, MAKE_JAY_TSX_COMPONENT } from '../core/constants';

export function parseTsxFile(filename: string, source: string): WithValidations<JayFile> {
    const sourceFile = createTsSourceFileFromSource(filename, source);
    const imports = parseImportLinks(sourceFile);
    const makeJayTsxComponentImport = getImportByName(
        imports,
        JAY_COMPONENT,
        MAKE_JAY_TSX_COMPONENT,
    );
    if (!Boolean(makeJayTsxComponentImport))
        return new WithValidations<JayFile>(undefined, [
            `Missing ${MAKE_JAY_TSX_COMPONENT} import`,
        ]);

    const makeJayTsxComponent_ImportName =
        makeJayTsxComponentImport.as || makeJayTsxComponentImport.name;
    const componentConstructors = findComponentConstructorCallsBlock(
        makeJayTsxComponent_ImportName,
        sourceFile,
    );
    return getBaseElementName(makeJayTsxComponent_ImportName, componentConstructors).map(
        (baseElementName) =>
            ({
                imports,
                baseElementName,
            }) as JayFile,
    );
}
