import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const { isReturnStatement, forEachChild } = tsBridge;
export function findFunctionExpressionReturnStatements(
    constructorDefinition: ts.FunctionLikeDeclarationBase,
): ts.ReturnStatement[] {
    const foundReturnStatements = [];

    function visit(node: ts.Node) {
        if (isReturnStatement(node)) foundReturnStatements.push(node);
        forEachChild(node, visit);
    }

    forEachChild(constructorDefinition, visit);
    return foundReturnStatements;
}
