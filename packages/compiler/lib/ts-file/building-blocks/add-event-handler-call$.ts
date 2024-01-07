import ts, {
    CallExpression,
    Expression,
    ExpressionStatement,
    isCallExpression,
    isPropertyAccessExpression,
    NodeFactory,
    TransformationContext,
} from 'typescript';
import { codeToAst } from '../ts-compiler-utils.ts';

const addEventHandlerCall = (context: TransformationContext, factory: NodeFactory, handlerIndex: number) => (node) => {
    if (isCallExpression(node) && isPropertyAccessExpression(node.expression)) {
        return factory.createCallExpression(
            factory.createPropertyAccessExpression(
                factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                        node.expression.expression,
                        node.expression.name.text + '$',
                    ),
                    undefined,
                    codeToAst(`handler$('${handlerIndex}')`, context).map(
                        (_: ExpressionStatement) => _.expression,
                    ) as Expression[],
                ),
                node.expression.name,
            ),
            undefined,
            node.arguments,
        );
    }
    return node;
};

export const addEventHandlerCallBlock =
    (context: TransformationContext, factory: NodeFactory, handlerIndex: number) => (eventHandler: CallExpression) => {
        return ts.visitNode(eventHandler, addEventHandlerCall(context, factory, handlerIndex));
    };
