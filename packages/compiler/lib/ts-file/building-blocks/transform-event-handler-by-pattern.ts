import ts, {ExpressionStatement, isBlock, isExpression, Statement,} from 'typescript';
import {CompiledPattern, JayTargetEnv} from './compile-function-split-patterns';
import {astToCode, codeToAst} from '../ts-compiler-utils';
import {SourceFileBindingResolver} from "./source-file-binding-resolver.ts";
import {SourceFileStatementDependencies} from "./source-file-statement-dependencies.ts";
import {SourceFileStatementAnalyzer} from "./source-file-statement-analyzer.ts";

interface MatchedPattern {
    pattern: CompiledPattern;
    patternKey: number;
}

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
            let sandboxStatements = [], mainStatements = [];
            node.statements.forEach(statement => {
                let statementAnalysis = analyzer.getStatementStatus(statement);
                switch (statementAnalysis.targetEnv) {
                    case JayTargetEnv.any: sandboxStatements.push(statement); mainStatements.push(statement); break;
                    case JayTargetEnv.main: mainStatements.push(statement); break;
                    case JayTargetEnv.sandbox: sandboxStatements.push(statement); break;
                }
            });
            sideEffects.safeStatements = [...sideEffects.safeStatements, ...mainStatements]
            if (sandboxStatements.length < node.statements.length) {
                sideEffects.wasEventHandlerTransformed = true;
                node = factory.updateBlock(node, sandboxStatements);
            }
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
