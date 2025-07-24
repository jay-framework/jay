import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { isBlock, isCallExpression, isExpressionStatement, isIdentifier, isPropertyAccessExpression,  } = tsModule;
import{
    flattenVariable,
    isFunctionVariableRoot,
    isParamVariableRoot,
} from '../basic-analyzers/name-binding-resolver';
import { isFunctionLikeDeclarationBase } from '../ts-utils/ts-compiler-utils';
import { SourceFileBindingResolver } from '../basic-analyzers/source-file-binding-resolver';
import {isIdentifierOrPropertyAccessExpression} from "../basic-analyzers/typescript-extras";

export interface FoundEventHandler {
    eventHandlerCallStatement: ts.ExpressionStatement;
    eventHandler: ts.FunctionLikeDeclarationBase;
    handlerIndex: number;
}

export function findEventHandlersBlock(
    functionDeclaration: ts.FunctionLikeDeclarationBase,
    bindingResolver: SourceFileBindingResolver,
): FoundEventHandler[] {
    const foundEventHandlers: FoundEventHandler[] = [];
    const foundEventHandlerFunctionsToHandlerIndex = new Map();
    let nextEventHandlerIndex = 0;
    if (isBlock(functionDeclaration.body)) {
        functionDeclaration.body.statements.forEach((statement) => {
            if (isExpressionStatement(statement) && isCallExpression(statement.expression)) {
                if (isIdentifierOrPropertyAccessExpression(statement.expression.expression)) {
                    let functionVariable = bindingResolver.explain(statement.expression.expression);

                    let accessChain = flattenVariable(functionVariable);
                    if (
                        accessChain.path.length === 2 &&
                        isParamVariableRoot(accessChain.root) &&
                        accessChain.root.param === functionDeclaration.parameters[1]
                    ) {
                        let handler = statement.expression.arguments[0];
                        if (isFunctionLikeDeclarationBase(handler))
                            foundEventHandlers.push({
                                eventHandler: handler,
                                eventHandlerCallStatement: statement,
                                handlerIndex: nextEventHandlerIndex++,
                            });
                        else if (isIdentifier(handler) || isPropertyAccessExpression(handler)) {
                            let flattenedHandler = flattenVariable(
                                bindingResolver.explain(handler),
                            );

                            if (
                                flattenedHandler.path.length === 0 &&
                                isFunctionVariableRoot(flattenedHandler.root)
                            )
                                foundEventHandlers.push({
                                    eventHandler: flattenedHandler.root.func,
                                    eventHandlerCallStatement: statement,
                                    handlerIndex:
                                        foundEventHandlerFunctionsToHandlerIndex.get(
                                            flattenedHandler.root,
                                        ) ??
                                        foundEventHandlerFunctionsToHandlerIndex
                                            .set(flattenedHandler.root, nextEventHandlerIndex++)
                                            .get(flattenedHandler.root),
                                });
                        }
                    }
                }
            }
        });
    }

    return foundEventHandlers;
}
