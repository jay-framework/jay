import { JAY_COMPONENT } from '@jay-framework/compiler-shared';
import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const { isStringLiteral, forEachChild, isImportDeclaration } = tsBridge;
import { getImportName, getImportSpecifiers } from '../ts-utils/extract-imports';

export function findMakeJayComponentImport(makeJayComponentName: string, node: ts.Node): string {
    if (
        isImportDeclaration(node) &&
        isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === JAY_COMPONENT
    ) {
        let importSpecifier = getImportSpecifiers(node as ts.ImportDeclaration)?.find(
            (element) => getImportName(element) === makeJayComponentName,
        );
        if (importSpecifier) {
            return importSpecifier.name.text;
        }
    }
    return undefined;
}

export function findMakeJayComponentImportTransformerBlock(
    makeJayComponentName: string,
    sourceFile: ts.SourceFile,
): string {
    let foundMakeJayComponentProperty: string = undefined;

    function visitor(node: ts.Node) {
        foundMakeJayComponentProperty =
            foundMakeJayComponentProperty || findMakeJayComponentImport(makeJayComponentName, node);
        forEachChild(node, visitor);
    }

    forEachChild(sourceFile, visitor);
    return foundMakeJayComponentProperty;
}
