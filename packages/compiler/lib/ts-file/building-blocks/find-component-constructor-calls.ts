import ts, { isCallExpression, isIdentifier, isVariableStatement } from 'typescript';

export type MapComponentConstructorCall<T> = (
    initializer: ts.CallExpression,
    name: ts.BindingName,
) => T;

export function findComponentConstructorCalls<T>(
    initializerName: string,
    mapCall: MapComponentConstructorCall<T>,
    node: ts.Node,
): T[] {
    const foundConstructorCalls: T[] = [];
    if (isVariableStatement(node)) {
        node.declarationList.declarations.forEach((declaration) => {
            if (
                declaration.initializer &&
                isCallExpression(declaration.initializer) &&
                isIdentifier(declaration.initializer.expression) &&
                declaration.initializer.expression.escapedText === initializerName
            )
                foundConstructorCalls.push(mapCall(declaration.initializer, declaration.name));
        });
    }
    return foundConstructorCalls;
}

export function findComponentConstructorCallsBlock<T>(
    initializerName: string,
    mapCall: MapComponentConstructorCall<T>,
    sourceFile: ts.SourceFile,
): T[] {
    const foundConstructorCalls: T[] = [];

    function visit(node): void {
        foundConstructorCalls.push(
            ...findComponentConstructorCalls(initializerName, mapCall, node),
        );
        ts.forEachChild(node, visit);
    }

    ts.forEachChild(sourceFile, visit);
    return foundConstructorCalls;
}
