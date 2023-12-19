import {SourceFileTransformerContext} from "../mk-transformer";
import ts, {ImportSpecifier, isImportDeclaration, isNamedImports, isStringLiteral} from "typescript";
import {JAY_COMPONENT, MAKE_JAY_COMPONENT} from "../../core/constants";

export function findMakeJayComponentImport({context, sourceFile}: SourceFileTransformerContext) {
    let foundMakeJayComponentProperty = undefined;

    const getImportElementOriginalName = (importSpecifier: ImportSpecifier): string => {
        return importSpecifier.propertyName
            ? importSpecifier.propertyName.text
            : importSpecifier.name.text;
    };

    const visitor: ts.Visitor = (node) => {
        if (
            isImportDeclaration(node) &&
            isStringLiteral(node.moduleSpecifier) &&
            node.moduleSpecifier.text === JAY_COMPONENT &&
            node.importClause.namedBindings &&
            isNamedImports(node.importClause.namedBindings)
        ) {
            let importSpecifier = node.importClause.namedBindings.elements.find(
                (element) => getImportElementOriginalName(element) === MAKE_JAY_COMPONENT,
            );
            if (importSpecifier) {
                foundMakeJayComponentProperty = importSpecifier.name.text;
            }
        }
        return node;
    };
    ts.visitEachChild(sourceFile, visitor, context);
    return foundMakeJayComponentProperty;
}