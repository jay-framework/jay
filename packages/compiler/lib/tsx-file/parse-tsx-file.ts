import { JayFile } from '../core/jay-file-types';
import { WithValidations } from '../core/with-validations';
import { parseImportLinks } from '../ts-file/parse-jay-file/parse-import-links';
import { createTsSourceFileFromSource } from '../ts-file/building-blocks/create-ts-source-file-from-source';
import { findComponentConstructorCallsBlock } from '../ts-file/building-blocks/find-component-constructor-calls';
import { getBaseElementName } from '../ts-file/building-blocks/get-base-element-name';
import { findMakeJayComponentImportTransformerBlock } from '../ts-file/building-blocks/find-make-jay-component-import';
import { MAKE_JAY_TSX_COMPONENT } from '../core/constants';

export function parseTsxFile(filename: string, source: string): WithValidations<JayFile> {
    const sourceFile = createTsSourceFileFromSource(filename, source);
    const imports = parseImportLinks(sourceFile);
    let makeJayComponent_ImportName = findMakeJayComponentImportTransformerBlock(
        MAKE_JAY_TSX_COMPONENT,
        sourceFile,
    );
    if (!Boolean(makeJayComponent_ImportName))
        return new WithValidations<JayFile>(undefined, [
            `Missing ${MAKE_JAY_TSX_COMPONENT} import`,
        ]);

    const componentConstructors = findComponentConstructorCallsBlock(
        makeJayComponent_ImportName,
        sourceFile,
    );
    return getBaseElementName(makeJayComponent_ImportName, componentConstructors).map(
        (baseElementName) =>
            ({
                imports,
                baseElementName,
            }) as JayFile,
    );
}
