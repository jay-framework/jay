import { codeToAst } from '../ts-utils/ts-compiler-utils';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { visitEachChild, isCallExpression, isPropertyAccessExpression } = tsModule;

const analyzeEventHandlerCall =
    (context: ts.TransformationContext, factory: ts.NodeFactory, handlerKey: string) => (node) => {
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
                            (_: ts.ExpressionStatement) => _.expression,
                        ) as ts.Expression[],
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
    (context: ts.TransformationContext, factory: ts.NodeFactory, handlerKey: string) =>
    (node: ts.ExpressionStatement) => {
        return visitEachChild(node, analyzeEventHandlerCall(context, factory, handlerKey), context);
    };
