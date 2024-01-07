import ts, {
    CallExpression, Expression, ExpressionStatement,
    isCallExpression,
    isPropertyAccessExpression,
    NodeFactory,
    TransformationContext
} from "typescript";
import {astToCode, codeToAst} from "../ts-compiler-utils.ts";

const addEventHandlerCall = (context: TransformationContext, factory: NodeFactory) => (node) => {
    if (isCallExpression(node) && isPropertyAccessExpression(node.expression)) {
        let eventHandlerName = node.expression.name.text;
        let argumentsCode = node.arguments.map(astToCode).join(', ');
        let code = `${astToCode(node.expression.expression)}.${eventHandlerName}$(handler$('1')).${eventHandlerName}(${argumentsCode})`
        return (codeToAst(code, context)[0] as ExpressionStatement).expression
    }
    return node;
}

export const addEventHandlerCallBlock =
    (context: TransformationContext, factory: NodeFactory) => (eventHandler: CallExpression) => {
        return ts.visitNode(eventHandler, addEventHandlerCall(context, factory))
    }