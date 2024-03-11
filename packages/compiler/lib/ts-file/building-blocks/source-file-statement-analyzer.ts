import ts, {
    CallExpression,
    Expression,
    Identifier,
    isArrowFunction,
    isBinaryExpression,
    isBlock,
    isCallExpression,
    isDoStatement,
    isForInStatement,
    isForOfStatement,
    isForStatement,
    isIdentifier,
    isIfStatement,
    isLiteralExpression,
    isPropertyAccessExpression,
    isStatement,
    isVariableStatement,
    isWhileStatement,
    PropertyAccessExpression,
    SourceFile,
    Statement,
} from 'typescript';
import { SourceFileBindingResolver } from './source-file-binding-resolver.ts';
import {
    CompiledPattern,
    CompilePatternType,
    CONST_READ_NAME,
    intersectJayTargetEnv,
    JayTargetEnv,
    KNOWN_VARIABLE_READ_NAME,
} from './compile-function-split-patterns.ts';
import {
    flattenVariable,
    isFunctionCallVariableRoot,
    isLiteralVariableRoot,
    isParamVariableRoot,
    LetOrConst,
} from './name-binding-resolver.ts';
import { ContextualVisitChild, visitWithContext } from '../visitor-with-context.ts';

export interface MatchedPattern {
    patterns: CompiledPattern[];
    expression: Expression;
    testId: number;
}

export interface AnalysisResult {
    targetEnv: JayTargetEnv;
    matchedPatterns: MatchedPattern[];
}

enum PatternMatchType {
    FULL,
    PARTIAL,
    NONE,
}

export class SourceFileStatementAnalyzer {
    private analyzedStatements = new Map<Statement, AnalysisResult>();
    private analyzedExpressions = new Map<Expression, MatchedPattern>();
    private nextId: number = 0;

    constructor(
        private sourceFile: SourceFile,
        private bindingResolver: SourceFileBindingResolver,
        private compiledPatterns: CompiledPattern[],
    ) {
        this.analyze();
    }

    private addPatternToStatement(statement: Statement, matchedPattern: MatchedPattern) {
        if (!this.analyzedStatements.get(statement)) {
            this.analyzedStatements.set(statement, {
                targetEnv: matchedPattern.patterns.reduce(
                    (prev, curr) => intersectJayTargetEnv(prev, curr.targetEnvForStatement),
                    JayTargetEnv.any,
                ),
                matchedPatterns: [matchedPattern],
            });
        } else {
            let analysisResult = this.analyzedStatements.get(statement);
            analysisResult.matchedPatterns.push(matchedPattern);
            analysisResult.targetEnv = intersectJayTargetEnv(
                analysisResult.targetEnv,
                matchedPattern.patterns.reduce(
                    (prev, curr) => intersectJayTargetEnv(prev, curr.targetEnvForStatement),
                    JayTargetEnv.any,
                ),
            );
        }
    }

    private markStatementSandbox(statement: ts.Statement) {
        if (!this.analyzedStatements.get(statement)) {
            this.analyzedStatements.set(statement, {
                targetEnv: JayTargetEnv.sandbox,
                matchedPatterns: [],
            });
        } else this.analyzedStatements.get(statement).targetEnv = JayTargetEnv.sandbox;
    }

    private analyze() {
        enum RoleInParent {
            none,
            read,
            assign,
            call,
        }

        interface AnalyzeContext {
            statement?: Statement;
            roleInParent: RoleInParent;
        }

        const analyzePropertyExpression = (
            expression: Identifier | PropertyAccessExpression,
            visitChild: ContextualVisitChild<AnalyzeContext>,
            statement: ts.Statement,
            roleInParent: RoleInParent,
        ) => {
            let expectedPatternType =
                roleInParent === RoleInParent.assign
                    ? CompilePatternType.ASSIGNMENT_LEFT_SIDE
                    : CompilePatternType.RETURN;
            let { matchedPatterns, matchType } = this.matchPattern(expression, expectedPatternType);

            if (matchType === PatternMatchType.FULL) {
                let matchedPattern = {
                    patterns: matchedPatterns,
                    expression,
                    testId: this.nextId++,
                };
                this.analyzedExpressions.set(expression, matchedPattern);
                this.addPatternToStatement(statement, matchedPattern);
            } else {
                if (isPropertyAccessExpression(expression))
                    visitChild(expression.expression, {
                        statement,
                        roleInParent: RoleInParent.read,
                    });
                this.markStatementSandbox(statement);
            }
        };

        const analyzeCallExpression = (
            node: CallExpression,
            visitChild: ContextualVisitChild<AnalyzeContext>,
            statement: ts.Statement,
            roleInParent: RoleInParent,
        ) => {
            if (isIdentifier(node.expression) || isPropertyAccessExpression(node.expression)) {
                let expression = node.expression;
                // analyze the function call arguments
                node.arguments.forEach((argument) =>
                    visitChild(argument, { statement, roleInParent: RoleInParent.read }),
                );

                let expectedPatternType =
                    roleInParent === RoleInParent.call
                        ? CompilePatternType.CALL
                        : CompilePatternType.CHAINABLE_CALL;
                let { matchedPatterns, matchType } = this.matchPattern(
                    expression,
                    expectedPatternType,
                );

                if (matchType === PatternMatchType.FULL) {
                    // check also arguments types are matching the pattern
                    node.arguments.forEach((argument, index) => {
                        let argumentMatchedPattern = this.getExpressionStatus(argument);
                        let patternTypeMatchArgumentType =
                            !!argumentMatchedPattern &&
                            argumentMatchedPattern.patterns.length > 0 &&
                            argumentMatchedPattern.patterns[0].returnType ===
                                matchedPatterns[0].callArgumentTypes[index];
                        let isLiteral = isLiteralExpression(argument);
                        if (!patternTypeMatchArgumentType && !isLiteral)
                            this.markStatementSandbox(statement);
                    });
                    let matchedPattern = {
                        patterns: matchedPatterns,
                        expression: isCallExpression(node) ? node : expression,
                        testId: this.nextId++,
                    };
                    this.analyzedExpressions.set(expression, matchedPattern);
                    this.addPatternToStatement(statement, matchedPattern);
                } else {
                    if (isPropertyAccessExpression(node.expression))
                        visitChild(node.expression.expression, {
                            statement,
                            roleInParent: RoleInParent.read,
                        });
                    this.markStatementSandbox(statement);
                }
            } else this.markStatementSandbox(statement);
        };

        visitWithContext<AnalyzeContext>(
            this.sourceFile,
            { roleInParent: RoleInParent.none },
            (node, { statement, roleInParent }, visitChild) => {
                if (isStatement(node)) statement = node;

                if (roleInParent === RoleInParent.read || roleInParent === RoleInParent.assign) {
                    if (isIdentifier(node) || isPropertyAccessExpression(node))
                        analyzePropertyExpression(node, visitChild, statement, roleInParent);
                    else if (isCallExpression(node))
                        analyzeCallExpression(node, visitChild, statement, roleInParent);
                    else if (
                        isBinaryExpression(node) &&
                        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
                    )
                        this.markStatementSandbox(statement);
                    else if (!isLiteralExpression(node) && !isBinaryExpression(node))
                        this.markStatementSandbox(statement);
                }

                if (
                    isCallExpression(node) &&
                    (isIdentifier(node.expression) ||
                        isPropertyAccessExpression(node.expression)) &&
                    roleInParent === RoleInParent.none
                ) {
                    analyzeCallExpression(node, visitChild, statement, RoleInParent.call);
                } else if (isVariableStatement(node)) {
                    node.declarationList.declarations.forEach((declaration) =>
                        visitChild(declaration.initializer, {
                            statement,
                            roleInParent: RoleInParent.read,
                        }),
                    );
                    if (this.getStatementStatus(node)?.targetEnv === JayTargetEnv.any)
                        this.getStatementStatus(node).targetEnv = JayTargetEnv.main;
                } else if (isArrowFunction(node) && !isBlock(node.body)) {
                    visitChild(node.body, { statement, roleInParent: RoleInParent.read });
                } else if (isIfStatement(node)) {
                    visitChild(node.expression, { statement, roleInParent: RoleInParent.read });
                    visitChild(node.thenStatement, { statement, roleInParent: RoleInParent.none });
                    if (node.elseStatement)
                        visitChild(node.elseStatement, {
                            statement,
                            roleInParent: RoleInParent.none,
                        });
                } else if (
                    isForStatement(node) ||
                    isForOfStatement(node) ||
                    isForInStatement(node) ||
                    isWhileStatement(node) ||
                    isDoStatement(node)
                ) {
                    this.markStatementSandbox(statement);
                } else if (isBinaryExpression(node)) {
                    visitChild(node.right, { statement, roleInParent: RoleInParent.read });
                    visitChild(node.left, {
                        statement,
                        roleInParent:
                            node.operatorToken.kind === ts.SyntaxKind.EqualsToken
                                ? RoleInParent.assign
                                : RoleInParent.read,
                    });
                } else {
                    node.getChildren().forEach((child) =>
                        visitChild(child, { statement, roleInParent: RoleInParent.none }),
                    );
                }
                return node;
            },
        );
    }

    private matchPattern(
        patternTarget: Identifier | PropertyAccessExpression,
        expectedPatternType: CompilePatternType,
    ): { matchedPatterns: CompiledPattern[]; matchType: PatternMatchType } {
        let variable = this.bindingResolver.explain(patternTarget);
        let resolvedVariable = flattenVariable(variable);
        let matchedPatterns = [];

        let currentVariableType: string;
        if (
            resolvedVariable.root &&
            (isParamVariableRoot(resolvedVariable.root) ||
                isFunctionCallVariableRoot(resolvedVariable.root))
        ) {
            if (isParamVariableRoot(resolvedVariable.root))
                currentVariableType = this.bindingResolver.explainType(
                    resolvedVariable.root.param.type,
                );
            else {
                let matchedPattern = this.getExpressionStatus(
                    resolvedVariable.root.node.expression,
                );
                if (matchedPattern) {
                    currentVariableType = matchedPattern.patterns.at(-1).returnType;
                }
            }
        }

        // const assigned a literal
        if (
            resolvedVariable.path.length === 0 &&
            resolvedVariable.root &&
            isLiteralVariableRoot(resolvedVariable.root)
        ) {
            if (variable.letOrConst === LetOrConst.CONST)
                return {
                    matchedPatterns: [
                        {
                            patternType: CompilePatternType.CONST_READ,
                            returnType: currentVariableType,
                            callArgumentTypes: [],
                            targetEnvForStatement: JayTargetEnv.any,
                            name: CONST_READ_NAME,
                            leftSidePath: [],
                            leftSideType: currentVariableType,
                        },
                    ],
                    matchType: PatternMatchType.FULL,
                };
            else return { matchedPatterns: [], matchType: PatternMatchType.NONE };
        }

        if (currentVariableType) {
            let currentPosition = 0;
            // variable assigned return value of a pattern
            if (resolvedVariable.path.length === 0) {
                return {
                    matchedPatterns: [
                        {
                            patternType: CompilePatternType.KNOWN_VARIABLE_READ,
                            returnType: currentVariableType,
                            callArgumentTypes: [],
                            targetEnvForStatement: JayTargetEnv.any,
                            name: KNOWN_VARIABLE_READ_NAME,
                            leftSidePath: [],
                            leftSideType: currentVariableType,
                        },
                    ],
                    matchType: PatternMatchType.FULL,
                };
            }

            while (currentPosition < resolvedVariable.path.length) {
                let currentMatch = this.compiledPatterns.find((pattern) => {
                    let leftTypeMatch = currentVariableType === pattern.leftSideType;
                    let pathMatch =
                        currentPosition + pattern.leftSidePath.length <=
                            resolvedVariable.path.length &&
                        pattern.leftSidePath.every(
                            (element, index) =>
                                element === resolvedVariable.path[index + currentPosition],
                        );
                    let expectedTypeMatch =
                        currentPosition + pattern.leftSidePath.length ===
                        resolvedVariable.path.length
                            ? pattern.patternType === expectedPatternType
                            : pattern.patternType === CompilePatternType.RETURN;
                    return leftTypeMatch && pathMatch && expectedTypeMatch;
                });
                if (currentMatch) {
                    matchedPatterns.push(currentMatch);
                    if (
                        currentPosition + currentMatch.leftSidePath.length <
                        resolvedVariable.path.length
                    ) {
                        currentVariableType = currentMatch.returnType;
                        currentPosition += currentMatch.leftSidePath.length;
                    } else
                        return {
                            matchedPatterns: matchedPatterns,
                            matchType: PatternMatchType.FULL,
                        };
                } else
                    return {
                        matchedPatterns: matchedPatterns,
                        matchType:
                            matchedPatterns.length > 0
                                ? PatternMatchType.PARTIAL
                                : PatternMatchType.NONE,
                    };
            }
        }
        return { matchedPatterns: [], matchType: PatternMatchType.NONE };
    }

    getExpressionStatus(expression: Expression): MatchedPattern {
        return this.analyzedExpressions.get(expression);
    }
    getStatementStatus(statement: Statement): AnalysisResult {
        return this.analyzedStatements.get(statement);
    }

    getMatchedExpressions() {
        return this.analyzedExpressions.keys();
    }

    getAnalyzedStatements() {
        return this.analyzedStatements.keys();
    }
}
