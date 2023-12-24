import {
    FunctionLikeDeclarationBase,
    isBlock,
    isCallExpression,
    isExpressionStatement, isFunctionDeclaration,
    isIdentifier,
    isPropertyAccessExpression,
    isVariableStatement,
} from 'typescript';
import { SourceFileTransformerContext } from '../mk-transformer.ts';
import { flattenVariable, NameBindingResolver } from './name-binding-resolver.ts';

export function findEventHandlersBlock(
    functionDeclaration: FunctionLikeDeclarationBase,
    { }: SourceFileTransformerContext,
): FunctionLikeDeclarationBase[] {
    const nameBindingResolver = new NameBindingResolver();
    nameBindingResolver.addFunctionParams(functionDeclaration);

    const foundEventHandlers = [];
    if (isBlock(functionDeclaration.body)) {
        functionDeclaration.body.statements.forEach((statement) => {
            if (isVariableStatement(statement)) nameBindingResolver.addVariableStatement(statement);
            else if (isFunctionDeclaration(statement)) nameBindingResolver.addFunctionDeclaration(statement);
            else if (isExpressionStatement(statement) && isCallExpression(statement.expression)) {
                let functionVariable;
                if (isPropertyAccessExpression(statement.expression.expression)) {
                    functionVariable = nameBindingResolver.resolvePropertyAccess(
                        statement.expression.expression,
                    );
                } else if (isIdentifier(statement.expression.expression)) {
                    functionVariable = nameBindingResolver.resolveIdentifier(
                        statement.expression.expression,
                    );
                }

                let accessChain = flattenVariable(functionVariable);
                if (
                    accessChain.path.length === 2 &&
                    accessChain.root === functionDeclaration.parameters[1]
                ) {
                    let handler = statement.expression.arguments[0];
                    if (isIdentifier(handler) && nameBindingResolver.variables.has(handler.text)) {
                        let flattenedHandler = flattenVariable(nameBindingResolver.variables.get(handler.text));
                        if (flattenedHandler.path.length === 0)
                            foundEventHandlers.push(flattenedHandler.root)
                    }
                    else
                        foundEventHandlers.push(handler);
                }
            }
        });
    }

    return foundEventHandlers;
}
