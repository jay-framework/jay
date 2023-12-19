import ts, {
    isImportDeclaration,
    isNamedImports,
    isStringLiteral,
} from 'typescript';
import {mkTransformer, SourceFileTransformerContext} from './mk-transformer.ts';
import {JAY_COMPONENT, MAKE_JAY_COMPONENT} from "../core/constants.ts";

function findMakeJayComponentImport({context, sourceFile}: SourceFileTransformerContext) {

    let foundMakeJayComponentProperty = undefined;

    const visitor: ts.Visitor = (node) => {
        if (isImportDeclaration(node) &&
            isStringLiteral(node.moduleSpecifier) &&
            node.moduleSpecifier.text === JAY_COMPONENT &&
            node.importClause.namedBindings &&
            isNamedImports(node.importClause.namedBindings)) {
            let importSpecifier = node.importClause.namedBindings.elements.find(element =>
                element.name.text === MAKE_JAY_COMPONENT)
            if (importSpecifier) {
                foundMakeJayComponentProperty = importSpecifier.propertyName?
                    importSpecifier.propertyName.text :
                    importSpecifier.name.text
            }

        }
        return node;
    }
    ts.visitEachChild(sourceFile, visitor, context)
    return foundMakeJayComponentProperty;
}

function findComponents(makeJayComponentName: void) {

}

function mkComponentSecureFunctionsTransformer(
    sourceFileTransformerData: SourceFileTransformerContext
) {
    let makeJayComponentName = findMakeJayComponentImport(sourceFileTransformerData);
    console.log(makeJayComponentName)
    // let components = findComponents(makeJayComponentName);

    return sourceFileTransformerData.sourceFile;
}

export function componentSecureFunctionsTransformer(): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer);
}
