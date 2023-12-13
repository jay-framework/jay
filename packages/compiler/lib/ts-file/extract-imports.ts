import * as ts from 'typescript';
import { withOriginalTrace } from '../utils/errors';

export function createTsSourceFileFromSource(filePath: string, sourceCode: string): ts.SourceFile {
    try {
        return ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
    } catch (error) {
        throw withOriginalTrace(
            new Error(`Failed to create TypeScript source file for ${filePath}`),
            error,
        );
    }
}

export function extractImports(filePath: string, sourceCode: string): ts.ImportDeclaration[] {
    const sourceFile = createTsSourceFileFromSource(filePath, sourceCode);
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

export function extractImportedModules(filePath: string, sourceCode: string): string[] {
    return extractImports(filePath, sourceCode)
        .filter((node) => ts.isStringLiteral(node.moduleSpecifier))
        .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
}

export function isRelativeImport(module: string): boolean {
    return module.startsWith('.');
}
