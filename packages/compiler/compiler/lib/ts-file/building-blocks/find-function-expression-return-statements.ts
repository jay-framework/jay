import ts from 'typescript';

export function findFunctionExpressionReturnStatements(
    constructorDefinition: ts.FunctionLikeDeclarationBase,
): ts.ReturnStatement[] {
    const foundReturnStatements = [];

    function visit(node: ts.Node) {
        if (ts.isReturnStatement(node)) foundReturnStatements.push(node);
        ts.forEachChild(node, visit);
    }

    ts.forEachChild(constructorDefinition, visit);
    return foundReturnStatements;
}
