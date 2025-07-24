import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { forEachChild, isImportDeclaration, isNamedImports, isStringLiteral, } = tsModule;


export function extractImportDeclarations(sourceFile: ts.SourceFile): ts.ImportDeclaration[] {
    const importDeclarations: ts.ImportDeclaration[] = [];

    function visit(node: ts.ImportDeclaration): void {
        if (isImportDeclaration(node)) {
            importDeclarations.push(node);
        }
        forEachChild(node, visit);
    }

    forEachChild(sourceFile, visit);
    return importDeclarations;
}

export function extractImportedModules(sourceFile: ts.SourceFile): string[] {
    return extractImportDeclarations(sourceFile)
        .filter((node) => isStringLiteral(node.moduleSpecifier))
        .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
}

export function isRelativeImport(module: string): boolean {
    return module.startsWith('.');
}

export function getImportSpecifiers(
    importDeclaration: ts.ImportDeclaration,
): ts.NodeArray<ts.ImportSpecifier> | undefined {
    const namedBindings = importDeclaration.importClause?.namedBindings;
    return namedBindings && isNamedImports(namedBindings) ? namedBindings.elements : undefined;
}

export function getImportName(importSpecifier: ts.ImportSpecifier): string {
    return importSpecifier.propertyName?.text ?? importSpecifier.name.text;
}
