import ts, {
    Expression,
    ExpressionStatement,
    isCallExpression,
    isPropertyAccessExpression,
    NodeFactory,
    TransformationContext,
} from 'typescript';
import { codeToAst } from '../ts-utils/ts-compiler-utils';

const analyzeEventHandlerCall =
    (context: TransformationContext, factory: NodeFactory, handlerKey: string) =>
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
                        codeToAst(`handler$('${handlerKey}')`, context).map(
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
    (context: TransformationContext, factory: NodeFactory, handlerKey: string) =>
    (node: ExpressionStatement) => {
        return ts.visitEachChild(
            node,
            analyzeEventHandlerCall(context, factory, handlerKey),
            context,
        );
    };
