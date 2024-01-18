import ts, {ExpressionStatement, isCallExpression, isPropertyAccessExpression, isVariableStatement} from 'typescript';
import {
    FlattenedAccessChain,
    flattenVariable,
    isParamVariableRoot,
    NameBindingResolver,
} from './name-binding-resolver';
import {CompiledPattern, CompilePatternType} from './compile-function-split-patterns';
import {codeToAst} from '../ts-compiler-utils';

interface MatchedPattern {
    pattern: CompiledPattern;
    patternKey: number;
}

function findPatternInVariable(
    resolvedParam: FlattenedAccessChain,
    compiledPatterns: CompiledPattern[],
    patternTypeToFind: CompilePatternType
): MatchedPattern {
    if (patternTypeToFind === CompilePatternType.RETURN) {
        let patternKey = compiledPatterns
            .filter(pattern => pattern.type === CompilePatternType.RETURN)
            .findIndex(pattern =>
                isParamVariableRoot(pattern.accessChain.root) &&
                resolvedParam.root &&
                isParamVariableRoot(resolvedParam.root) &&
                pattern.accessChain.root.paramIndex === resolvedParam.root.paramIndex &&
                pattern.accessChain.path.length <= resolvedParam.path.length &&
                pattern.accessChain.path.every(
                    (element, index) => element === resolvedParam.path[index],
                ),
            )
        let pattern = patternKey === -1 ? undefined : compiledPatterns[patternKey];
        return { pattern, patternKey };
    }
    else {// if (patternTypeToFind === CompilePatternType.CALL) {
        let patternKey = compiledPatterns.findIndex(
            (pattern) =>
                isParamVariableRoot(pattern.accessChain.root) &&
                resolvedParam.root &&
                isParamVariableRoot(resolvedParam.root) &&
                pattern.accessChain.root.paramIndex === resolvedParam.root.paramIndex &&
                pattern.accessChain.path.length <= resolvedParam.path.length &&
                pattern.accessChain.path.every(
                    (element, index) => element === resolvedParam.path[index],
                ),
        );
        let pattern = patternKey === -1 ? undefined : compiledPatterns[patternKey];
        return { pattern, patternKey };
    }
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
        if (isPropertyAccessExpression(node)) {
            let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(node);
            let flattenedResolvedParam = flattenVariable(resolvedParam);
            let { pattern, patternKey } = findPatternInVariable(
                flattenedResolvedParam,
                compiledPatterns,
                CompilePatternType.RETURN
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
        else if (isCallExpression(node)) {
            let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(node.expression);
            let flattenedResolvedParam = flattenVariable(resolvedParam);
            let { pattern, patternKey } = findPatternInVariable(
                flattenedResolvedParam,
                compiledPatterns,
                CompilePatternType.CALL
            );
            if (pattern)
                return undefined;

        }
        else if (isVariableStatement(node)) {
            nameBindingResolver.addVariableStatement(node);
        }
        return ts.visitEachChild(node, visitor, context);;
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
