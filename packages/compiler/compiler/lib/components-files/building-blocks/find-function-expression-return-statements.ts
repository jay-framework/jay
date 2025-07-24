import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { forEachChild, isReturnStatement } = tsModule;
;

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
