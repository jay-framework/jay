import ts, {
    CallExpression,
    Expression,
    ExpressionStatement,
    isCallExpression,
    isPropertyAccessExpression,
    NodeFactory,
    TransformationContext,
} from 'typescript';
import { codeToAst } from '../ts-compiler-utils';
import { FoundEventHandler } from './find-event-handler-functions';

const transformEventHandlerCall$ =
    (context: TransformationContext, factory: NodeFactory, foundEventHandler: FoundEventHandler) =>
    (node) => {
        if (isCallExpression(node) && isPropertyAccessExpression(node.expression)) {
            return factory.createCallExpression(
                factory.createPropertyAccessExpression(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            node.expression.expression,
                            node.expression.name.text + '$',
                        ),
                        undefined,
                        codeToAst(`handler$('${foundEventHandler.handlerIndex}')`, context).map(
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

export const transformEventHandlerCall$Block =
    (context: TransformationContext, factory: NodeFactory, foundEventHandler: FoundEventHandler) =>
    (eventHandler: CallExpression) => {
        return ts.visitNode(eventHandler, transformEventHandlerCall$(context, factory, foundEventHandler));
    };

export const transformEventHandlerCallStatement$Block =
    (context: TransformationContext, factory: NodeFactory, foundEventHandler: FoundEventHandler) =>
        (node: ExpressionStatement) => {
            return ts.visitEachChild(
                node,
                transformEventHandlerCall$Block(context, factory, foundEventHandler),
                context,
            )
        }