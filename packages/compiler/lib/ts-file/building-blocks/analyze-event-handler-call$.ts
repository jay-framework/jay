import ts, {
    Expression,
    ExpressionStatement,
    isCallExpression,
    isPropertyAccessExpression,
    NodeFactory,
    TransformationContext,
} from 'typescript';
import { codeToAst } from '../ts-utils/ts-compiler-utils';
import { FoundEventHandler } from './find-event-handler-functions';
import {analyzeEventHandlerByPatternBlock} from "./analyze-event-handler-by-pattern";

const analyzeEventHandlerCall =
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
                    factory.createIdentifier('then'),
                ),
                undefined,
                node.arguments,
            );
        }
        return node;
    };

export const analyzeEventHandlerCallStatement$Block =
    (context: TransformationContext, factory: NodeFactory, foundEventHandler: FoundEventHandler) =>
    (node: ExpressionStatement) => {
        return ts.visitEachChild(
            node,
            analyzeEventHandlerCall(context, factory, foundEventHandler),
            context,
        );
    };
