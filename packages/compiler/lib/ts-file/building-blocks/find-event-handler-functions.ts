import {
    ExpressionStatement,
    FunctionLikeDeclarationBase,
    isBlock,
    isCallExpression,
    isExpressionStatement,
    isFunctionDeclaration,
    isIdentifier,
    isPropertyAccessExpression,
    isVariableStatement,
} from 'typescript';
import { SourceFileTransformerContext } from '../mk-transformer';
import { flattenVariable, NameBindingResolver } from './name-binding-resolver';
import { isFunctionLikeDeclarationBase } from '../ts-compiler-utils';

export interface FoundEventHandler {
    eventHandlerCallStatement: ExpressionStatement;
    eventHandler: FunctionLikeDeclarationBase;
}

export function findEventHandlersBlock(
    functionDeclaration: FunctionLikeDeclarationBase,
    {}: SourceFileTransformerContext,
): FoundEventHandler[] {
    const nameBindingResolver = new NameBindingResolver();
    nameBindingResolver.addFunctionParams(functionDeclaration);

    const foundEventHandlers: FoundEventHandler[] = [];
    if (isBlock(functionDeclaration.body)) {
        functionDeclaration.body.statements.forEach((statement) => {
            if (isVariableStatement(statement)) nameBindingResolver.addVariableStatement(statement);
            else if (isFunctionDeclaration(statement))
                nameBindingResolver.addFunctionDeclaration(statement);
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
                    if (isFunctionLikeDeclarationBase(handler))
                        foundEventHandlers.push({
                            eventHandler: handler,
                            eventHandlerCallStatement: statement,
                        });
                    else {
                        // else if (isIdentifier(handler) && nameBindingResolver.variables.has(handler.text)) {
                        let flattenedHandler = flattenVariable(
                            nameBindingResolver.resolvePropertyAccessChain(handler),
                        );
                        if (flattenedHandler.path.length === 0)
                            foundEventHandlers.push({
                                eventHandler: flattenedHandler.root as FunctionLikeDeclarationBase,
                                eventHandlerCallStatement: statement,
                            });
                    }
                }
            }
        });
    }

    return foundEventHandlers;
}
