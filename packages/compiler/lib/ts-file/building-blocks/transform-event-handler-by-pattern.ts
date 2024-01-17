import ts, {
    Expression,
    ExpressionStatement,
    isBlock,
    isCallExpression,
    isExpressionStatement,
    isPropertyAccessExpression
} from 'typescript';
import {
    FlattenedAccessChain,
    flattenVariable, isParamVariableRoot,
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
            isParamVariableRoot(pattern.accessChain.root) &&
            pattern.accessChain.root.paramIndex === pattern.accessChain.root.paramIndex &&
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
    matchedReturnPatterns: MatchedPattern[]
) {
    if (matchedReturnPatterns.length > 0) {
        let returnedObjectProperties = matchedReturnPatterns.map(
            ({ pattern, patternKey }) => `$${patternKey}: ${pattern.accessChain.path.join('.')}`,
        );
        return `({ event }) => ({${returnedObjectProperties.join(',\n')}})`;
    } else return undefined;
}

const mkTransformEventHandlerStatementVisitor = (
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    nameBindingResolver: NameBindingResolver,
    compiledPatterns: CompiledPattern[]) => {

    let sideEffects: {
        matchedReturnPatterns: MatchedPattern[],
        wasEventHandlerTransformed: boolean
    } = {
        matchedReturnPatterns: [],
        wasEventHandlerTransformed: false
    }

    const visitor = (node) => {
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
                        sideEffects.matchedReturnPatterns.push({ pattern, patternKey });
                        let replacementPattern = [
                            `event.$${patternKey}`,
                            ...flattenedResolvedParam.path.splice(
                                pattern.accessChain.path.length + 1,
                            ),
                        ];
                        sideEffects.wasEventHandlerTransformed = true;
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
            return ts.visitEachChild(node, visitor, context);
        } else if (isExpressionStatement(node)) {
            return ts.visitEachChild(node, visitor, context);
        }
        return node;
    };
    return {visitor, sideEffects};
}


export const transformEventHandlerByPatternBlock = (
    context: ts.TransformationContext,
    compiledPatterns: CompiledPattern[],
    factory: ts.NodeFactory,
    eventHandler: ts.FunctionLikeDeclarationBase,
): TransformedEventHandlerByPattern => {
    let nameBindingResolver = new NameBindingResolver();
    nameBindingResolver.addFunctionParams(eventHandler);

    const {sideEffects, visitor} =
        mkTransformEventHandlerStatementVisitor(factory, context, nameBindingResolver, compiledPatterns);

    const transformedEventHandler = ts.visitEachChild(
        eventHandler,
        visitor,
        context,
    );

    const functionRepositoryFragment = generateFunctionRepository(sideEffects.matchedReturnPatterns);

    return { transformedEventHandler, wasEventHandlerTransformed: sideEffects.wasEventHandlerTransformed, functionRepositoryFragment };
};
