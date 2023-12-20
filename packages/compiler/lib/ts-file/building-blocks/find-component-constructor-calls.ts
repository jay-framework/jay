import { SourceFileTransformerContext } from '../mk-transformer';
import ts, {
    BindingName,
    Expression,
    isCallExpression,
    isIdentifier,
    isVariableStatement,
} from 'typescript';

export interface MakeJayComponentConstructorCalls {
    render: Expression;
    comp: Expression;
    name: BindingName;
}

export function findComponentConstructorCalls(
    makeJayComponentName: string,
    node: ts.Node,
): MakeJayComponentConstructorCalls[] {
    const foundConstructorCalls: MakeJayComponentConstructorCalls[] = [];
    if (isVariableStatement(node)) {
        node.declarationList.declarations.forEach((declaration) => {
            if (
                declaration.initializer &&
                isCallExpression(declaration.initializer) &&
                isIdentifier(declaration.initializer.expression) &&
                declaration.initializer.expression.escapedText === makeJayComponentName
            )
                foundConstructorCalls.push({
                    render: declaration.initializer.arguments[0],
                    comp: declaration.initializer.arguments[1],
                    name: declaration.name,
                });
        });
    }
    return foundConstructorCalls;
}

export function findComponentConstructorCallsBlock(
    makeJayComponentName: string,
    { context, sourceFile }: SourceFileTransformerContext,
): MakeJayComponentConstructorCalls[] {
    let foundConstructorCalls: MakeJayComponentConstructorCalls[] = [];

    const findConstructorNames: ts.Visitor = (node) => {
        foundConstructorCalls = [
            ...foundConstructorCalls,
            ...findComponentConstructorCalls(makeJayComponentName, node),
        ];
        return node;
    };

    ts.visitEachChild(sourceFile, findConstructorNames, context);

    return foundConstructorCalls;
}
