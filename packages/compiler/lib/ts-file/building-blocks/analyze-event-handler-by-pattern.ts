import ts, {
    Block,
    ExpressionStatement,
    Identifier,
    isBlock,
    isExpression,
    isIdentifier,
    isLiteralExpression,
    isStatement,
    TypeReferenceNode,
    Visitor,
} from 'typescript';
import {
    CompiledPattern,
    CompilePatternType,
    intersectJayTargetEnv,
    JayTargetEnv,
} from '../basic-analyzers/compile-function-split-patterns';
import { astToCode, codeToAst } from '../ts-utils/ts-compiler-utils';
import { SourceFileBindingResolver } from '../basic-analyzers/source-file-binding-resolver';
import {
    ScopedSourceFileStatementAnalyzer,
    SourceFileStatementAnalyzer,
} from '../basic-analyzers/scoped-source-file-statement-analyzer';
import { ContextualVisitor2, visitWithContext2 } from '../ts-utils/visitor-with-context';
import { flattenVariable, LiteralVariableRoot } from '../basic-analyzers/name-binding-resolver';
import {
    FunctionRepositoryBuilder,
    FunctionRepositoryCodeFragment,
} from './function-repository-builder';
import { isFirstParamJayEvent } from './filter-event-handlers-to-have-jay-event-type';

interface MatchedPattern {
    pattern: CompiledPattern;
    patternKey: number;
}

interface MatchedVariable {
    variable: Identifier;
    patternKey: number;
}

export interface TransformedEventHandlerByPattern {
    transformedEventHandler: ts.Node;
    handlerKey: string;
    wasEventHandlerTransformed: boolean;
}

function generateFunctionRepository(
    matchedReturnPatterns: MatchedPattern[],
    matchedVariableReads: MatchedVariable[],
    matchedConstants: string[],
    safeStatements: ts.Statement[],
): FunctionRepositoryCodeFragment {
    const constCode = [...new Set(matchedConstants)].join('\n');

    let readPatternsReturnProperties = matchedReturnPatterns.map(
        ({ pattern, patternKey }) => `$${patternKey}: ${pattern.leftSidePath.join('.')}`,
    );
    readPatternsReturnProperties = [...new Set(readPatternsReturnProperties)];
    let variableReadsReturnProperties = matchedVariableReads.map(
        ({ variable, patternKey }) => `$${patternKey}: ${variable.text}`,
    );
    let returnedObjectProperties = [
        ...readPatternsReturnProperties,
        ...variableReadsReturnProperties,
    ].join(',\n');
    if (safeStatements.length > 0) {
        const handlerCode = `({ event }: JayEvent<any, any>) => {
    ${safeStatements.map((statement) => astToCode(statement)).join('\n\t')}
${returnedObjectProperties.length > 0 ? `\treturn ({${returnedObjectProperties}})\n` : ''}
}`;
        return { handlerCode, key: constCode };
    }
    if (matchedReturnPatterns.length > 0) {
        let handlerCode = `({ event }: JayEvent<any, any>) => ({${returnedObjectProperties}})`;
        return { handlerCode, key: constCode };
    } else return { key: undefined, handlerCode: undefined };
}

interface TransformEventHandlerStatementVisitorSideEffects {
    matchedConstants: string[];
    matchedVariableReads: MatchedVariable[];
    mainContextBlocks: Map<Block, Block>;
    // safeStatements: Statement[];
    matchedReturnPatterns: MatchedPattern[];
    wasEventHandlerTransformed: boolean;
}

interface VisitorContext {
    parentStatementTargetEnv: JayTargetEnv;
}

const mkTransformEventHandlerStatementVisitor = (
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    bindingResolver: SourceFileBindingResolver,
    analyzer: ScopedSourceFileStatementAnalyzer,
): {
    sideEffects: TransformEventHandlerStatementVisitorSideEffects;
    visitor: ContextualVisitor2<VisitorContext>;
} => {
    let sideEffects: TransformEventHandlerStatementVisitorSideEffects = {
        matchedVariableReads: [],
        matchedConstants: [],
        mainContextBlocks: new Map(),
        matchedReturnPatterns: [],
        wasEventHandlerTransformed: false,
    };

    let patternIndexes = new Map<CompiledPattern, number>();
    const getPatternIndex = (pattern: CompiledPattern) => {
        if (!patternIndexes.has(pattern)) {
            patternIndexes.set(pattern, patternIndexes.size);
        }
        return patternIndexes.get(pattern);
    };

    const visitor: ContextualVisitor2<VisitorContext> = (
        node,
        { parentStatementTargetEnv },
        visitChild,
        visitEachChild,
    ) => {
        if (isStatement(node)) {
            let statementAnalysis = analyzer.getStatementStatus(node);
            if (statementAnalysis)
                parentStatementTargetEnv = intersectJayTargetEnv(
                    parentStatementTargetEnv,
                    statementAnalysis.targetEnv,
                );
        }

        if (isBlock(node) && parentStatementTargetEnv !== JayTargetEnv.sandbox) {
            let sandboxStatements = [],
                mainStatements = [];
            node.statements.forEach((statement) => {
                let statementAnalysis = analyzer.getStatementStatus(statement);
                switch (statementAnalysis.targetEnv) {
                    case JayTargetEnv.any:
                        sandboxStatements.push(statement);
                        mainStatements.push(statement);
                        break;
                    case JayTargetEnv.main:
                        mainStatements.push(statement);
                        break;
                    case JayTargetEnv.sandbox:
                        sandboxStatements.push(statement);
                        break;
                }
            });
            sideEffects.mainContextBlocks.set(node, factory.createBlock(mainStatements));

            if (sandboxStatements.length < node.statements.length)
                sideEffects.wasEventHandlerTransformed = true;

            // switch to contextual visitor, pass the parent statement env.
            sandboxStatements = sandboxStatements.map((statement) =>
                visitChild(statement, { parentStatementTargetEnv }),
            );

            node = factory.updateBlock(node, sandboxStatements);
            return node;
        } else if (isExpression(node)) {
            let expressionAnalysis = analyzer.getExpressionStatus(node);
            if (expressionAnalysis) {
                let pattern = expressionAnalysis.patterns[0];
                let patternKey = getPatternIndex(pattern);
                if (pattern.patternType === CompilePatternType.RETURN)
                    sideEffects.matchedReturnPatterns.push({ pattern, patternKey });
                else if (
                    pattern.patternType === CompilePatternType.KNOWN_VARIABLE_READ &&
                    isIdentifier(node)
                )
                    sideEffects.matchedVariableReads.push({ variable: node, patternKey });
                else if (
                    pattern.patternType === CompilePatternType.CONST_READ &&
                    isIdentifier(node)
                ) {
                    let constant = bindingResolver.explain(node);
                    let flattenedConstant = flattenVariable(constant);
                    let literal = (flattenedConstant.root as LiteralVariableRoot).literal;
                    if (isLiteralExpression(literal)) {
                        let constantValue = literal.text;
                        sideEffects.matchedConstants.push(`const ${node.text} = ${constantValue}`);
                    }
                    return node;
                } else return node;
                let replacementPattern = `event.$${patternKey}`;
                sideEffects.wasEventHandlerTransformed = true;
                return (codeToAst(replacementPattern, context)[0] as ExpressionStatement)
                    .expression;
            }
        }
        return visitEachChild(node, { parentStatementTargetEnv });
    };
    return { visitor, sideEffects };
};

export const analyzeEventHandlerByPatternBlock = (
    context: ts.TransformationContext,
    bindingResolver: SourceFileBindingResolver,
    analyzer: SourceFileStatementAnalyzer,
    factory: ts.NodeFactory,
    eventHandler: ts.FunctionLikeDeclarationBase,
    functionsRepository: FunctionRepositoryBuilder,
): TransformedEventHandlerByPattern => {
    const scopedAnalyzer = analyzer.analyzeForScope(eventHandler);
    const { sideEffects, visitor } = mkTransformEventHandlerStatementVisitor(
        factory,
        context,
        bindingResolver,
        scopedAnalyzer,
    );

    let transformedEventHandler = visitWithContext2(
        eventHandler,
        { parentStatementTargetEnv: JayTargetEnv.any },
        context,
        visitor,
    );

    // replace JayEvent<X, VS> to JayEvent<any, VS>
    if (
        sideEffects.wasEventHandlerTransformed &&
        isFirstParamJayEvent(eventHandler, bindingResolver)
    ) {
        const originalJayEventType = eventHandler.parameters[0].type as TypeReferenceNode;
        if (originalJayEventType.typeArguments?.length === 2) {
            const transformedJayEventType = factory.createTypeReferenceNode(
                originalJayEventType.typeName,
                [
                    factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                    originalJayEventType.typeArguments[1],
                ],
            );
            let visitor = (node: ts.Node) => {
                if (node === originalJayEventType) {
                    return ts.visitEachChild(transformedJayEventType, visitor, context);
                }
                return ts.visitEachChild(node, visitor, context);
            };
            transformedEventHandler = ts.visitEachChild(transformedEventHandler, visitor, context);
        }

        // generate function repository body
        let bodyForFunctionRepository: Block = undefined;
        if (isBlock(eventHandler.body) && sideEffects.mainContextBlocks.has(eventHandler.body)) {
            let body = sideEffects.mainContextBlocks.get(eventHandler.body);
            const replaceBodiesVisitor: Visitor = (node: ts.Node) => {
                let mainNode =
                    isBlock(node) && sideEffects.mainContextBlocks.has(node)
                        ? sideEffects.mainContextBlocks.get(node)
                        : node;
                return ts.visitEachChild(mainNode, replaceBodiesVisitor, context);
            };
            bodyForFunctionRepository = ts.visitNode(body, replaceBodiesVisitor) as Block;
        }

        const { handlerCode, key } = generateFunctionRepository(
            sideEffects.matchedReturnPatterns,
            sideEffects.matchedVariableReads,
            sideEffects.matchedConstants,
            bodyForFunctionRepository ? [...bodyForFunctionRepository.statements] : [],
        );

        const handlerKey = functionsRepository.addFunction(handlerCode);
        functionsRepository.addConst(key);

        return {
            transformedEventHandler,
            wasEventHandlerTransformed: sideEffects.wasEventHandlerTransformed,
            handlerKey,
        };
    } else
        return {
            handlerKey: '',
            transformedEventHandler,
            wasEventHandlerTransformed: false,
        };
};
