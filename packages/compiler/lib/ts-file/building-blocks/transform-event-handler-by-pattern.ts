import ts, {
    Expression,
    ExpressionStatement,
    isBlock,
    isCallExpression,
    isExpressionStatement,
    isPropertyAccessExpression,
} from 'typescript';
import {
    FlattenedAccessChain,
    flattenVariable,
    NameBindingResolver,
} from './name-binding-resolver';
import { CompiledPattern } from './compile-function-split-patterns';
import { codeToAst } from '../ts-compiler-utils';

function findPatternInVariable(
    resolvedParam: FlattenedAccessChain,
    paramIndex: number,
    compiledPatterns: CompiledPattern[],
) {
    return compiledPatterns.find(
        (pattern) =>
            paramIndex === pattern.paramIndex &&
            pattern.accessChain.path.length <= resolvedParam.path.length &&
            pattern.accessChain.path.every(
                (element, index) => element === resolvedParam.path[index],
            ),
    );
}

export interface TransformedEventHandlerByPattern {
    transformedEventHandler: ts.Node;
    wasEventHandlerTransformed: boolean;
}

export const transformEventHandlerByPatternBlock = (
    context: ts.TransformationContext,
    compiledPatterns: CompiledPattern[],
    factory: ts.NodeFactory,
    eventHandler: ts.FunctionLikeDeclarationBase,
): TransformedEventHandlerByPattern => {
    let nameBindingResolver = new NameBindingResolver();
    nameBindingResolver.addFunctionParams(eventHandler);

    let wasEventHandlerTransformed = false;

    const transformEventHandlerStatement = (node) => {
        if (isCallExpression(node)) {
            let newArguments: Expression[] = node.arguments.map((argument, paramIndex) => {
                if (isPropertyAccessExpression(argument)) {
                    let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(argument);
                    let flattenedResolvedParam = flattenVariable(resolvedParam);
                    let patternMatch = findPatternInVariable(
                        flattenedResolvedParam,
                        paramIndex,
                        compiledPatterns,
                    );
                    if (patternMatch) {
                        let replacementPattern = [
                            'event.$1',
                            ...flattenedResolvedParam.path.splice(
                                patternMatch.accessChain.path.length,
                            ),
                        ];
                        wasEventHandlerTransformed = true;
                        return (
                            codeToAst(
                                replacementPattern.join('.'),
                                context,
                            )[0] as ExpressionStatement
                        ).expression;
                    }
                }
                return argument;
            });
            return factory.createCallExpression(node.expression, undefined, newArguments);
        } else if (isBlock(node)) {
            return ts.visitEachChild(node, transformEventHandlerStatement, context);
        } else if (isExpressionStatement(node)) {
            return ts.visitEachChild(node, transformEventHandlerStatement, context);
        }
        return node;
    };

    const transformedEventHandler = ts.visitEachChild(
        eventHandler,
        transformEventHandlerStatement,
        context,
    );
    return { transformedEventHandler, wasEventHandlerTransformed };
};
