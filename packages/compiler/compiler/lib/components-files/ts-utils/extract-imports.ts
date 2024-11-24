import * as ts from 'typescript';

export function extractImportDeclarations(sourceFile: ts.SourceFile): ts.ImportDeclaration[] {
    const importDeclarations: ts.ImportDeclaration[] = [];

    function visit(node: ts.ImportDeclaration): void {
        if (ts.isImportDeclaration(node)) {
            importDeclarations.push(node);
        }
        ts.forEachChild(node, visit);
    }

    ts.forEachChild(sourceFile, visit);
    return importDeclarations;
}

export function extractImportedModules(sourceFile: ts.SourceFile): string[] {
    return extractImportDeclarations(sourceFile)
        .filter((node) => ts.isStringLiteral(node.moduleSpecifier))
        .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
}

export function isRelativeImport(module: string): boolean {
    return module.startsWith('.');
}

export function getImportSpecifiers(
    importDeclaration: ts.ImportDeclaration,
): ts.NodeArray<ts.ImportSpecifier> | undefined {
    const namedBindings = importDeclaration.importClause?.namedBindings;
    return namedBindings && ts.isNamedImports(namedBindings) ? namedBindings.elements : undefined;
}

export function getImportName(importSpecifier: ts.ImportSpecifier): string {
    return importSpecifier.propertyName?.text ?? importSpecifier.name.text;
}
