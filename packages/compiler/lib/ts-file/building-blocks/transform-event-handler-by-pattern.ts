import ts, {
    ExpressionStatement, isBlock,
    isCallExpression, isExpression,
    isExpressionStatement,
    isPropertyAccessExpression,
    isStatement,
    isVariableStatement,
    Statement,
} from 'typescript';
import {
    FlattenedAccessChain,
    flattenVariable,
    isParamVariableRoot,
    NameBindingResolver,
} from './name-binding-resolver';
import { CompiledPattern, CompilePatternType } from './compile-function-split-patterns';
import { astToCode, codeToAst } from '../ts-compiler-utils';
import {SourceFileBindingResolver} from "./source-file-binding-resolver.ts";
import {SourceFileStatementDependencies} from "./source-file-statement-dependencies.ts";
import {SourceFileStatementAnalyzer} from "./source-file-statement-analyzer.ts";

interface MatchedPattern {
    pattern: CompiledPattern;
    patternKey: number;
}

/*
function findPatternInVariable(
    resolvedParam: FlattenedAccessChain,
    compiledPatterns: CompiledPattern[],
    patternTypeToFind: CompilePatternType,
): MatchedPattern {
    let patternKey = compiledPatterns
        .filter((pattern) => pattern.patternType === patternTypeToFind)
        .findIndex(
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
*/

export interface TransformedEventHandlerByPattern {
    transformedEventHandler: ts.Node;
    functionRepositoryFragment?: string;
    wasEventHandlerTransformed: boolean;
}


function generateFunctionRepository(
    matchedReturnPatterns: MatchedPattern[],
    safeStatements: ts.Statement[],
) {
    let returnedObjectProperties = matchedReturnPatterns
        .map(({ pattern, patternKey }) => `$${patternKey}: ${pattern.leftSidePath.join('.')}`)
        .join(',\n');
    if (safeStatements.length > 0) {
        return `({ event }: JayEvent) => {
    ${safeStatements.map((statement) => astToCode(statement)).join('\n\t')}
${returnedObjectProperties.length > 0 ? `\treturn ({${returnedObjectProperties}})\n` : ''}
}`;
    }
    if (matchedReturnPatterns.length > 0) {
        return `({ event }: JayEvent) => ({${returnedObjectProperties}})`;
    } else return undefined;
}


// function isSafeStatement(
//     node: Statement,
//     nameBindingResolver: NameBindingResolver,
//     compiledPatterns: CompiledPattern[],
// ) {
//     if (isExpressionStatement(node) && isCallExpression(node.expression)) {
//         let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(
//             node.expression.expression,
//         );
//         let flattenedResolvedParam = flattenVariable(resolvedParam);
//         let { pattern } = findPatternInVariable(
//             flattenedResolvedParam,
//             compiledPatterns,
//             CompilePatternType.CALL,
//         );
//         if (pattern) return true;
//     }
//     else if (isVariableStatement(node)) {
//         return node.declarationList.declarations.reduce((agg, declaration) => {
//             let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(
//                 declaration.initializer,
//             );
//             let flattenedResolvedParam = flattenVariable(resolvedParam);
//             let { pattern } = findPatternInVariable(
//                 flattenedResolvedParam,
//                 compiledPatterns,
//                 CompilePatternType.RETURN,
//             );
//             return pattern && agg;
//         }, true)
//     }
//     return false;
// }

interface TransformEventHandlerStatementVisitorSideEffects {
    safeStatements: Statement[];
    matchedReturnPatterns: MatchedPattern[];
    wasEventHandlerTransformed: boolean;
}

const mkTransformEventHandlerStatementVisitor = (
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    bindingResolver: SourceFileBindingResolver,
    dependencies: SourceFileStatementDependencies,
    analyzer: SourceFileStatementAnalyzer,
): {sideEffects: TransformEventHandlerStatementVisitorSideEffects, visitor: (node: ts.Node) => ts.Node} => {
    let sideEffects: TransformEventHandlerStatementVisitorSideEffects = {
        safeStatements: [],
        matchedReturnPatterns: [],
        wasEventHandlerTransformed: false,
    };

    const visitor = (node) => {
        if (isBlock(node)) {

        }
        else if (isExpression(node)) {
            let expressionAnalysis = analyzer.getExpressionStatus(node);
            if (expressionAnalysis) {
                let pattern = expressionAnalysis.patterns[0];
                let patternKey = expressionAnalysis.testId;
                sideEffects.matchedReturnPatterns.push({ pattern, patternKey });
                let replacementPattern =
                    `event.$${patternKey}`
                sideEffects.wasEventHandlerTransformed = true;
                return (codeToAst(replacementPattern, context)[0] as ExpressionStatement)
                    .expression;
            }
        }
        // if (isVariableStatement(node)) {
        //     nameBindingResolver.addVariableStatement(node);
        // }
        //
        // if (
        //     isStatement(node) &&
        //     isSafeStatement(node, nameBindingResolver, compiledPatterns)
        // ) {
        //     sideEffects.wasEventHandlerTransformed = true;
        //     sideEffects.safeStatements.push(node);
        //     return undefined;
        // } else if (isPropertyAccessExpression(node)) {
        //     let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(node);
        //     let flattenedResolvedParam = flattenVariable(resolvedParam);
        //     let { pattern, patternKey } = findPatternInVariable(
        //         flattenedResolvedParam,
        //         compiledPatterns,
        //         CompilePatternType.RETURN,
        //     );
        //     if (pattern) {
        //         sideEffects.matchedReturnPatterns.push({ pattern, patternKey });
        //         let replacementPattern = [
        //             `event.$${patternKey}`,
        //             ...flattenedResolvedParam.path.splice(pattern.accessChain.path.length + 1),
        //         ];
        //         sideEffects.wasEventHandlerTransformed = true;
        //         return (codeToAst(replacementPattern.join('.'), context)[0] as ExpressionStatement)
        //             .expression;
        //     }
        // }
        return ts.visitEachChild(node, visitor, context);
    };
    return { visitor, sideEffects };
};

export const transformEventHandlerByPatternBlock = (
    context: ts.TransformationContext,
    bindingResolver: SourceFileBindingResolver,
    dependencies: SourceFileStatementDependencies,
    analyzer: SourceFileStatementAnalyzer,
    factory: ts.NodeFactory,
    eventHandler: ts.FunctionLikeDeclarationBase,
): TransformedEventHandlerByPattern => {

    const { sideEffects, visitor } = mkTransformEventHandlerStatementVisitor(
        factory,
        context,
        bindingResolver,
        dependencies,
        analyzer
    );

    const transformedEventHandler = ts.visitNode(eventHandler, visitor);

    const functionRepositoryFragment = generateFunctionRepository(
        sideEffects.matchedReturnPatterns,
        sideEffects.safeStatements,
    );

    return {
        transformedEventHandler,
        wasEventHandlerTransformed: sideEffects.wasEventHandlerTransformed,
        functionRepositoryFragment,
    };
};
