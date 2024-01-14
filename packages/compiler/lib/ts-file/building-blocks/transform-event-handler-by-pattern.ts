import ts, {
    Expression,
    ExpressionStatement,
    isBlock,
    isCallExpression,
    isExpressionStatement,
    isPropertyAccessExpression,
    TransformationContext,
} from 'typescript';
import {
    FlattenedAccessChain,
    flattenVariable,
    NameBindingResolver,
} from './name-binding-resolver';
import { CompiledPattern } from './compile-function-split-patterns';
import { codeToAst } from '../ts-compiler-utils';

interface MatchedPattern {
    pattern: CompiledPattern;
    patternKey: number;
}

function findPatternInVariable(
    resolvedParam: FlattenedAccessChain,
    paramIndex: number,
    compiledPatterns: CompiledPattern[],
): MatchedPattern {
    let patternKey = compiledPatterns.findIndex(
        (pattern) =>
            paramIndex === pattern.paramIndex &&
            pattern.accessChain.path.length <= resolvedParam.path.length &&
            pattern.accessChain.path.every(
                (element, index) => element === resolvedParam.path[index],
            ),
    );
    let pattern = patternKey === -1 ? undefined : compiledPatterns[patternKey];
    return { pattern, patternKey };
}

export interface TransformedEventHandlerByPattern {
    transformedEventHandler: ts.Node;
    functionRepositoryFragment?: string;
    wasEventHandlerTransformed: boolean;
}

function generateFunctionRepository(
    matchedReturnPatterns: MatchedPattern[],
    context: TransformationContext,
) {
    if (matchedReturnPatterns.length > 0) {
        let returnedObjectProperties = matchedReturnPatterns.map(
            ({ pattern, patternKey }) => `$${patternKey}: ${pattern.accessChain.path.join('.')}`,
        );
        return `({ event }) => ({${returnedObjectProperties.join(',\n')}})`;
    } else return undefined;
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
    let matchedReturnPatterns: MatchedPattern[] = [];

    const transformEventHandlerStatement = (node) => {
        if (isCallExpression(node)) {
            let newArguments: Expression[] = node.arguments.map((argument, paramIndex) => {
                if (isPropertyAccessExpression(argument)) {
                    let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(argument);
                    let flattenedResolvedParam = flattenVariable(resolvedParam);
                    let { pattern, patternKey } = findPatternInVariable(
                        flattenedResolvedParam,
                        paramIndex,
                        compiledPatterns,
                    );
                    if (pattern) {
                        matchedReturnPatterns.push({ pattern, patternKey });
                        let replacementPattern = [
                            `event.$${patternKey}`,
                            ...flattenedResolvedParam.path.splice(pattern.accessChain.path.length+1),
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

    const functionRepositoryFragment = generateFunctionRepository(matchedReturnPatterns, context);

    return { transformedEventHandler, wasEventHandlerTransformed, functionRepositoryFragment };
};
