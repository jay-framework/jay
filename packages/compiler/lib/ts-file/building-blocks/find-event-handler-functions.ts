import {
    FunctionLikeDeclarationBase,
    isBlock,
    isCallExpression,
    isExpressionStatement,
    isIdentifier,
    isPropertyAccessExpression,
    isVariableStatement,
} from "typescript";
import {SourceFileTransformerContext} from "../mk-transformer.ts";
import {flattenVariable, NameBindingResolver} from "./name-binding-resolver.ts";

export function findEventHandlersBlock(
    functionDeclaration: FunctionLikeDeclarationBase,
    { context, sourceFile }: SourceFileTransformerContext,
): FunctionLikeDeclarationBase[] {
    const nameBindingResolver = new NameBindingResolver();
    nameBindingResolver.addFunctionParams(functionDeclaration)

    const foundEventHandlers = [];
    if (isBlock(functionDeclaration.body)) {
        functionDeclaration.body.statements.forEach(statement => {
            if (isVariableStatement(statement))
                nameBindingResolver.addVariableStatement(statement)
            else if (isExpressionStatement(statement) &&
                isCallExpression(statement.expression)) {
                let functionVariable;
                if (isPropertyAccessExpression(statement.expression.expression)) {
                    functionVariable = nameBindingResolver.resolvePropertyAccess(statement.expression.expression)
                }
                else if (isIdentifier(statement.expression.expression)) {
                    functionVariable = nameBindingResolver.resolveIdentifier(statement.expression.expression);
                }

                let accessChain = flattenVariable(functionVariable);
                if (accessChain.path.length === 2 &&
                    accessChain.root === functionDeclaration.parameters[1])
                    foundEventHandlers.push(statement.expression.arguments[0]);
            }
        })
    }

    return foundEventHandlers;
}
