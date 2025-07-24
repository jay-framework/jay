import { JAY_COMPONENT } from '@jay-framework/compiler-shared';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { forEachChild, isImportDeclaration, isStringLiteral } = tsModule;
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
