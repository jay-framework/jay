import ts, {
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
import { flattenVariable, NameBindingResolver } from './name-binding-resolver';
import { isFunctionLikeDeclarationBase } from '../ts-compiler-utils';

export interface FoundEventHandler {
    eventHandlerMatchedPatterns: boolean;
    eventHandlerCallStatement: ExpressionStatement;
    eventHandler: FunctionLikeDeclarationBase;
    handlerIndex: number;
}

export class FoundEventHandlers {
    private handlers: Set<ts.Node>;
    private eventHandlerCallStatements: Map<ts.Node, FoundEventHandler>;
    constructor(public readonly foundEventHandlers: FoundEventHandler[]) {
        this.handlers = new Set<ts.Node>(foundEventHandlers.map((_) => _.eventHandler));
        this.eventHandlerCallStatements = new Map<ts.Node, FoundEventHandler>(
            foundEventHandlers.map((_) => [_.eventHandlerCallStatement, _]),
        );
    }

    hasEventHandler(node: ts.Node): boolean {
        return this.handlers.has(node);
    }

    hasEventHandlerCallStatement(node: ts.Node): boolean {
        return this.eventHandlerCallStatements.has(node);
    }

    getFoundEventHandlerByCallStatement(node: ts.Node): FoundEventHandler {
        return this.eventHandlerCallStatements.get(node);
    }

    getFoundEventHandlersByHandler(node: ts.Node): FoundEventHandler[] {
        return this.foundEventHandlers.filter((_) => _.eventHandler === node);
    }
}

export function findEventHandlersBlock(
    functionDeclaration: FunctionLikeDeclarationBase,
): FoundEventHandler[] {
    const nameBindingResolver = new NameBindingResolver();
    nameBindingResolver.addFunctionParams(functionDeclaration);

    const foundEventHandlers: FoundEventHandler[] = [];
    const foundEventHandlerFunctionsToHandlerIndex = new Map();
    let nextEventHandlerIndex = 0;
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
                            eventHandlerMatchedPatterns: false,
                            eventHandler: handler,
                            eventHandlerCallStatement: statement,
                            handlerIndex: nextEventHandlerIndex++,
                        });
                    else {
                        // else if (isIdentifier(handler) && nameBindingResolver.variables.has(handler.text)) {
                        let flattenedHandler = flattenVariable(
                            nameBindingResolver.resolvePropertyAccessChain(handler),
                        );

                        if (flattenedHandler.path.length === 0)
                            foundEventHandlers.push({
                                eventHandlerMatchedPatterns: false,
                                eventHandler: flattenedHandler.root as FunctionLikeDeclarationBase,
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
        });
    }

    return foundEventHandlers;
}
