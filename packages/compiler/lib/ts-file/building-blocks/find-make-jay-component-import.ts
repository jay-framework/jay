import { SourceFileTransformerContext } from '../mk-transformer';
import ts, { ImportSpecifier, isImportDeclaration, isStringLiteral } from 'typescript';
import { JAY_COMPONENT, MAKE_JAY_COMPONENT } from '../../core/constants';
import { getImportName, getImportSpecifiers } from '../extract-imports';

export function findMakeJayComponentImport(node: ts.Node): string {
    if (
        isImportDeclaration(node) &&
        isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === JAY_COMPONENT
    ) {
        let importSpecifier = getImportSpecifiers(node as ts.ImportDeclaration)?.find(
            (element) => getImportName(element) === MAKE_JAY_COMPONENT,
        );
        if (importSpecifier) {
            return importSpecifier.name.text;
        }
    }
    return undefined;
}

export function findMakeJayComponentImportTransformerBlock({
    context,
    sourceFile,
}: SourceFileTransformerContext) {
    let foundMakeJayComponentProperty = undefined;

    const visitor: ts.Visitor = (node) => {
        foundMakeJayComponentProperty =
            foundMakeJayComponentProperty || findMakeJayComponentImport(node);
        return node;
    };
    ts.visitEachChild(sourceFile, visitor, context);
    return foundMakeJayComponentProperty;
}
