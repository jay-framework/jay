import ts, { isImportDeclaration, isStringLiteral } from 'typescript';
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

export function findMakeJayComponentImportTransformerBlock(sourceFile: ts.SourceFile) {
    let foundMakeJayComponentProperty = undefined;

    function visitor(node: ts.Node) {
        foundMakeJayComponentProperty =
            foundMakeJayComponentProperty || findMakeJayComponentImport(node);
        ts.forEachChild(node, visitor);
    }

    ts.forEachChild(sourceFile, visitor);
    return foundMakeJayComponentProperty;
}
