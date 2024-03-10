import ts, {
    Block,
    ExpressionStatement,
    Identifier,
    isBlock,
    isExpression,
    isIdentifier,
    Visitor,
} from 'typescript';
import {CompiledPattern, CompilePatternType, JayTargetEnv} from './compile-function-split-patterns';
import {astToCode, codeToAst} from '../ts-compiler-utils';
import {SourceFileBindingResolver} from "./source-file-binding-resolver.ts";
import {SourceFileStatementDependencies} from "./source-file-statement-dependencies.ts";
import {SourceFileStatementAnalyzer} from "./source-file-statement-analyzer.ts";

interface MatchedPattern {
    pattern: CompiledPattern;
    patternKey: number;
}

interface MatchedVariable {
    variable: Identifier,
    patternKey: number
}

export interface TransformedEventHandlerByPattern {
    transformedEventHandler: ts.Node;
    functionRepositoryFragment?: string;
    wasEventHandlerTransformed: boolean;
}


function generateFunctionRepository(
    matchedReturnPatterns: MatchedPattern[],
    matchedVariableReads: MatchedVariable[],
    safeStatements: ts.Statement[],
) {
    let readPatternsReturnProperties = matchedReturnPatterns
        .map(({ pattern, patternKey }) => `$${patternKey}: ${pattern.leftSidePath.join('.')}`)
    let variableReadsReturnProperties = matchedVariableReads
        .map(({ variable, patternKey}) => `$${patternKey}: ${variable.text}`)
    let returnedObjectProperties = [...readPatternsReturnProperties, ...variableReadsReturnProperties]
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
    matchedVariableReads: MatchedVariable[];
    mainContextBlocks: Map<Block, Block>;
    // safeStatements: Statement[];
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
        matchedVariableReads: [],
        // safeStatements: [],
        mainContextBlocks: new Map(),
        matchedReturnPatterns: [],
        wasEventHandlerTransformed: false,
    };

    let patternIndexes = new Map<CompiledPattern, number>();
    const getPatternIndex = (pattern: CompiledPattern) => {
        if (!patternIndexes.has(pattern)) {
            patternIndexes.set(pattern, patternIndexes.size)
        }
        return patternIndexes.get(pattern)
    }

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
            sideEffects.mainContextBlocks.set(node, factory.createBlock(mainStatements))
            // sideEffects.safeStatements = [...sideEffects.safeStatements, ...mainStatements]

            if (sandboxStatements.length < node.statements.length)
                sideEffects.wasEventHandlerTransformed = true;

            sandboxStatements = sandboxStatements.map(statement =>
                ts.visitNode(statement, visitor))

            node = factory.updateBlock(node, sandboxStatements);
            return node;
        }
        else if (isExpression(node)) {
            let expressionAnalysis = analyzer.getExpressionStatus(node);
            if (expressionAnalysis) {
                let pattern = expressionAnalysis.patterns[0];
                let patternKey = getPatternIndex(pattern);
                if (pattern.patternType === CompilePatternType.RETURN)
                    sideEffects.matchedReturnPatterns.push({ pattern, patternKey });
                else if (pattern.patternType === CompilePatternType.KNOWN_VARIABLE_READ && isIdentifier(node))
                    sideEffects.matchedVariableReads.push({variable: node, patternKey});
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

    let bodyForFunctionRepository: Block = undefined;
    if (isBlock(eventHandler.body) && sideEffects.mainContextBlocks.has(eventHandler.body)) {
        let body = sideEffects.mainContextBlocks.get(eventHandler.body);
        const replaceBodiesVisitor: Visitor = (node: ts.Node) => {
            let mainNode = (isBlock(node) && sideEffects.mainContextBlocks.has(node))?
                sideEffects.mainContextBlocks.get(node) : node;
            return ts.visitEachChild(mainNode, replaceBodiesVisitor, context);
        }
        bodyForFunctionRepository = ts.visitNode(body, replaceBodiesVisitor) as Block;
    }

    const functionRepositoryFragment = generateFunctionRepository(
        sideEffects.matchedReturnPatterns,
        sideEffects.matchedVariableReads,
        bodyForFunctionRepository? [...bodyForFunctionRepository.statements] : [],
    );

    return {
        transformedEventHandler,
        wasEventHandlerTransformed: sideEffects.wasEventHandlerTransformed,
        functionRepositoryFragment,
    };
};
