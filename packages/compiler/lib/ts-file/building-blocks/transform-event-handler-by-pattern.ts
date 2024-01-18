import ts, {
    ExpressionStatement,
    isCallExpression, isExpressionStatement,
    isPropertyAccessExpression,
    isStatement,
    isVariableStatement, Statement
} from 'typescript';
import {
    FlattenedAccessChain,
    flattenVariable,
    isParamVariableRoot,
    NameBindingResolver,
} from './name-binding-resolver';
import {CompiledPattern, CompilePatternType} from './compile-function-split-patterns';
import {astToCode, codeToAst} from '../ts-compiler-utils';

interface MatchedPattern {
    pattern: CompiledPattern;
    patternKey: number;
}

function findPatternInVariable(
    resolvedParam: FlattenedAccessChain,
    compiledPatterns: CompiledPattern[],
    patternTypeToFind: CompilePatternType
): MatchedPattern {
    let patternKey = compiledPatterns
        .filter(pattern => pattern.type === patternTypeToFind)
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

export interface TransformedEventHandlerByPattern {
    transformedEventHandler: ts.Node;
    functionRepositoryFragment?: string;
    wasEventHandlerTransformed: boolean;
}

function generateFunctionRepository(
    matchedReturnPatterns: MatchedPattern[]
    , safeStatements: ts.Statement[]) {

    let returnedObjectProperties = matchedReturnPatterns.map(
        ({ pattern, patternKey }) => `$${patternKey}: ${pattern.accessChain.path.join('.')}`,
    ).join(',\n');
    if (safeStatements.length > 0) {
        return `({ event }) => {
    ${safeStatements.map(statement => astToCode(statement)).join('\n\t')}
${(returnedObjectProperties.length > 0)?`\treturn ({${returnedObjectProperties}})\n`:''}
}`
    }
    if (matchedReturnPatterns.length > 0) {
        return `({ event }) => ({${returnedObjectProperties}})`;
    } else return '';
}

function isSafeStatement(node: Statement, nameBindingResolver: NameBindingResolver, compiledPatterns: CompiledPattern[]) {
    if (isExpressionStatement(node) &&
        isCallExpression(node.expression)) {
        let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(node.expression.expression);
        let flattenedResolvedParam = flattenVariable(resolvedParam);
        let { pattern, patternKey } = findPatternInVariable(
            flattenedResolvedParam,
            compiledPatterns,
            CompilePatternType.CALL
        );
        if (pattern)
            return true;
    }
    return false;
}

const mkTransformEventHandlerStatementVisitor = (
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    nameBindingResolver: NameBindingResolver,
    compiledPatterns: CompiledPattern[]) => {

    let sideEffects: {
        safeStatements: Statement[];
        matchedReturnPatterns: MatchedPattern[],
        wasEventHandlerTransformed: boolean
    } = {
        safeStatements: [],
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
        else if (isStatement(node) && isSafeStatement(node, nameBindingResolver, compiledPatterns)) {
            sideEffects.wasEventHandlerTransformed = true;
            sideEffects.safeStatements.push(node);
            return undefined;
        }
        // else if (isCallExpression(node)) {
        //     let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(node.expression);
        //     let flattenedResolvedParam = flattenVariable(resolvedParam);
        //     let { pattern, patternKey } = findPatternInVariable(
        //         flattenedResolvedParam,
        //         compiledPatterns,
        //         CompilePatternType.CALL
        //     );
        //     if (pattern)
        //         return undefined;
        //
        // }
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

    const functionRepositoryFragment = generateFunctionRepository(sideEffects.matchedReturnPatterns, sideEffects.safeStatements);

    return { transformedEventHandler, wasEventHandlerTransformed: sideEffects.wasEventHandlerTransformed, functionRepositoryFragment };
};
