import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript');
const {
    isArrowFunction,
    isConstructorDeclaration,
    isFunctionDeclaration,
    isFunctionExpression,
    isGetAccessorDeclaration,
    isMethodDeclaration,
    isSetAccessorDeclaration,
    createPrinter,
    EmitHint,
    createSourceFile,
    ScriptTarget,
    setTextRange,
    visitEachChild,
    NewLineKind,
} = tsModule;

const printer: ts.Printer = createPrinter({
    newLine: NewLineKind.LineFeed,
});

export function astToCode(node: ts.Node) {
    return printer.printNode(EmitHint.Unspecified, node, undefined);
}

export function codeToAst(code: string, context: ts.TransformationContext): ts.Node[] {
    let dummySourceFile = createSourceFile('dummy.ts', code, ScriptTarget.Latest, true);

    function visitor(node: ts.Node): ts.Node | ts.Node[] | undefined {
        let updatedNode = setTextRange(node, { pos: -1, end: -1 });
        return visitEachChild(updatedNode, visitor, context);
    }

    return Array.from(visitEachChild(dummySourceFile, visitor, context).statements);
}

export function isFunctionLikeDeclarationBase(
    node: ts.Node,
): node is ts.Expression & ts.FunctionLikeDeclarationBase {
    return (
        isFunctionExpression(node) ||
        isArrowFunction(node) ||
        isFunctionDeclaration(node) ||
        isMethodDeclaration(node) ||
        isConstructorDeclaration(node) ||
        isGetAccessorDeclaration(node) ||
        isSetAccessorDeclaration(node)
    );
}
