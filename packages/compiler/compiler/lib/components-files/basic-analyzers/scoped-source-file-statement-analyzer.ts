import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const {
    isArrowFunction,
    isBinaryExpression,
    isBlock,
    isCallExpression,
    isDoStatement,
    isElementAccessExpression,
    isForInStatement,
    isForOfStatement,
    isForStatement,
    isIfStatement,
    isLiteralExpression,
    isNewExpression,
    isPropertyAccessExpression,
    isStatement,
    isVariableStatement,
    isWhileStatement,
    SyntaxKind,
} = tsModule;
import {
    areResolvedTypesCompatible,
    FunctionResolvedType,
    ResolvedType,
    SourceFileBindingResolver,
} from './source-file-binding-resolver';
import {
    areCompatiblePatternTypes,
    CompiledPattern,
    CompilePatternType,
    CONST_READ_NAME,
    INLINE_ARROW_FUNCTION,
    intersectJayTargetEnv,
    JayTargetEnv,
    KNOWN_VARIABLE_READ_NAME,
} from './compile-function-split-patterns';
import {
    flattenVariable,
    isFunctionCallVariableRoot,
    isGlobalVariableRoot,
    isImportModuleVariableRoot,
    isLiteralVariableRoot,
    isParamVariableRoot,
    LetOrConst,
} from './name-binding-resolver';
import { ContextualVisitChild, visitWithContext } from '../ts-utils/visitor-with-context';
import { isIdentifierOrPropertyAccessExpression, byAnd } from './typescript-extras';

export interface MatchedPattern {
    patterns: CompiledPattern[];
    expression: ts.Expression;
    testId: number;
    subExpressionsMatching: boolean;
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
    constructor(
        private sourceFile: ts.SourceFile,
        private bindingResolver: SourceFileBindingResolver,
        private compiledPatterns: CompiledPattern[],
    ) {}

    analyzeForScope(analysisScope: ts.Node) {
        return new ScopedSourceFileStatementAnalyzer(
            this.sourceFile,
            this.bindingResolver,
            this.compiledPatterns,
            analysisScope,
        );
    }
}

export class ScopedSourceFileStatementAnalyzer {
    private analyzedStatements = new Map<ts.Statement, AnalysisResult>();
    private analyzedExpressions = new Map<ts.Expression, MatchedPattern>();
    private nextId: number = 0;

    constructor(
        private sourceFile: ts.SourceFile,
        private bindingResolver: SourceFileBindingResolver,
        private compiledPatterns: CompiledPattern[],
        analysisScope: ts.Node,
    ) {
        this.analyze(analysisScope);
    }

    private addPatternToStatement(statement: ts.Statement, matchedPattern: MatchedPattern) {
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

    private analyze(analysisScope: ts.Node) {
        enum RoleInParent {
            none,
            read,
            assign,
            call,
        }

        interface AnalyzeContext {
            statement?: ts.Statement;
            roleInParent: RoleInParent;
        }

        const addExpressionStatus = (
            statement: ts.Statement,
            patterns: CompiledPattern[],
            expression: ts.Expression,
            subExpressionsMatching: boolean,
        ) => {
            let matchedPattern = {
                patterns,
                expression,
                testId: this.nextId++,
                subExpressionsMatching,
            };
            this.analyzedExpressions.set(expression, matchedPattern);
            this.addPatternToStatement(statement, matchedPattern);
        };

        const analyzePropertyExpression = (
            expression: ts.Identifier | ts.PropertyAccessExpression,
            visitChild: ContextualVisitChild<AnalyzeContext>,
            statement: ts.Statement,
            roleInParent: RoleInParent,
        ) => {
            let expectedPatternType =
                roleInParent === RoleInParent.assign
                    ? CompilePatternType.ASSIGNMENT_LEFT_SIDE
                    : CompilePatternType.RETURN;
            let { matchedPatterns, matchType } = this.matchPattern(
                expression,
                expectedPatternType,
                analysisScope,
            );

            if (matchType === PatternMatchType.FULL) {
                addExpressionStatus(statement, matchedPatterns, expression, true);
            } else {
                if (isPropertyAccessExpression(expression))
                    visitChild(expression.expression, {
                        statement,
                        roleInParent: RoleInParent.read,
                    });
                this.markStatementSandbox(statement);
            }
        };

        const analyzeCallParam = (
            argument: ts.Expression,
            matchedPatterns: CompiledPattern[],
            index: number,
            statement: ts.Statement,
        ) => {
            const expressionStatus = this.getExpressionStatus(argument);
            const patternTypeMatchArgumentType =
                !!expressionStatus &&
                expressionStatus.patterns.length > 0 &&
                expressionStatus.subExpressionsMatching &&
                areResolvedTypesCompatible(
                    expressionStatus.patterns[0].returnType,
                    matchedPatterns[0].callArgumentTypes[index],
                );

            const isLiteral = isLiteralExpression(argument);

            let isScopedVariableAccess = false;
            if (isIdentifierOrPropertyAccessExpression(argument)) {
                const variable = this.bindingResolver.explain(argument);
                const flattened = flattenVariable(variable);
                isScopedVariableAccess =
                    isParamVariableRoot(flattened.root) &&
                    isChildOf(flattened.root.param, analysisScope);
            }

            const paramMatching =
                patternTypeMatchArgumentType || isLiteral || isScopedVariableAccess;
            if (!paramMatching) this.markStatementSandbox(statement);
            return paramMatching;
        };

        const analyzeCallOrNewExpression = (
            node: ts.CallExpression | ts.NewExpression,
            visitChild: ContextualVisitChild<AnalyzeContext>,
            statement: ts.Statement,
            roleInParent: RoleInParent,
        ) => {
            if (isIdentifierOrPropertyAccessExpression(node.expression)) {
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
                    analysisScope,
                );

                if (matchType === PatternMatchType.FULL) {
                    // check also arguments types are matching the pattern
                    let areArgumentsMatching = node.arguments
                        .map((argument, index) => {
                            return analyzeCallParam(argument, matchedPatterns, index, statement);
                        })
                        .reduce(byAnd(), true);
                    addExpressionStatus(statement, matchedPatterns, node, areArgumentsMatching);
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
                    if (isIdentifierOrPropertyAccessExpression(node))
                        analyzePropertyExpression(node, visitChild, statement, roleInParent);
                    else if (isCallExpression(node) || isNewExpression(node)) {
                        analyzeCallOrNewExpression(node, visitChild, statement, roleInParent);
                        return node;
                    } else if (
                        isBinaryExpression(node) &&
                        node.operatorToken.kind === SyntaxKind.EqualsToken
                    )
                        this.markStatementSandbox(statement);
                    else if (!isLiteralExpression(node) && !isBinaryExpression(node))
                        this.markStatementSandbox(statement);
                }

                if (
                    isCallExpression(node) &&
                    isIdentifierOrPropertyAccessExpression(node.expression) &&
                    roleInParent === RoleInParent.none
                ) {
                    analyzeCallOrNewExpression(node, visitChild, statement, RoleInParent.call);
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
                    const bodyStatus = this.getExpressionStatus(node.body);
                    if (!!bodyStatus && bodyStatus.subExpressionsMatching) {
                        addExpressionStatus(
                            statement,
                            [
                                {
                                    patternType: CompilePatternType.INLINE_ARROW_FUNCTION,
                                    returnType: new FunctionResolvedType(
                                        [],
                                        bodyStatus.patterns[0].returnType,
                                    ),
                                    callArgumentTypes: [],
                                    targetEnvForStatement: JayTargetEnv.any,
                                    name: INLINE_ARROW_FUNCTION,
                                    leftSidePath: [],
                                    leftSideType: new FunctionResolvedType(
                                        [],
                                        bodyStatus.patterns[0].returnType,
                                    ),
                                },
                            ],
                            node,
                            true,
                        );
                    }
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
                    node.getChildren().forEach((child) =>
                        visitChild(child, { statement, roleInParent: RoleInParent.none }),
                    );
                } else if (isBinaryExpression(node)) {
                    visitChild(node.right, { statement, roleInParent: RoleInParent.read });
                    visitChild(node.left, {
                        statement,
                        roleInParent:
                            node.operatorToken.kind === SyntaxKind.EqualsToken
                                ? RoleInParent.assign
                                : RoleInParent.read,
                    });
                } else if (isElementAccessExpression(node)) {
                    node.getChildren().forEach((child) =>
                        visitChild(child, { statement, roleInParent: RoleInParent.read }),
                    );
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
        patternTarget: ts.Identifier | ts.PropertyAccessExpression,
        expectedPatternType: CompilePatternType,
        analysisScope: ts.Node,
    ): { matchedPatterns: CompiledPattern[]; matchType: PatternMatchType } {
        let variable = this.bindingResolver.explain(patternTarget);
        let resolvedVariable = flattenVariable(variable);
        let matchedPatterns = [];

        let currentVariableType: ResolvedType;
        if (resolvedVariable.root) {
            if (isParamVariableRoot(resolvedVariable.root))
                currentVariableType = this.bindingResolver.explainType(
                    resolvedVariable.root.param.type,
                );
            else if (isGlobalVariableRoot(resolvedVariable.root)) {
                currentVariableType = this.bindingResolver.globalType(resolvedVariable.root);
            } else if (isFunctionCallVariableRoot(resolvedVariable.root)) {
                let matchedPattern = this.getExpressionStatus(resolvedVariable.root.node);
                if (matchedPattern) {
                    currentVariableType = matchedPattern.patterns.at(-1).returnType;
                }
            } else if (isImportModuleVariableRoot(resolvedVariable.root)) {
                currentVariableType =
                    this.bindingResolver.explainFlattenedVariableType(resolvedVariable);
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

            while (currentPosition <= resolvedVariable.path.length) {
                if (resolvedVariable.path.length === 0) {
                    if (
                        variable.definingStatement &&
                        isChildOf(variable.definingStatement, analysisScope)
                    ) {
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
                }
                let currentMatch = this.compiledPatterns.find((pattern) => {
                    let leftTypeMatch = areResolvedTypesCompatible(
                        currentVariableType,
                        pattern.leftSideType,
                    );
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
                            ? areCompatiblePatternTypes(pattern.patternType, expectedPatternType)
                            : areCompatiblePatternTypes(
                                  pattern.patternType,
                                  CompilePatternType.RETURN,
                              );
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

    getExpressionStatus(expression: ts.Expression): MatchedPattern {
        return this.analyzedExpressions.get(expression);
    }
    getStatementStatus(statement: ts.Statement): AnalysisResult {
        return this.analyzedStatements.get(statement);
    }

    getMatchedExpressions() {
        return this.analyzedExpressions.keys();
    }

    getAnalyzedStatements() {
        return this.analyzedStatements.keys();
    }
}

function isChildOf(node: ts.Node, parent: ts.Node) {
    if (node === parent) return false;
    if (!node.parent) return false;
    for (const sibling of node.parent.getChildren()) if (sibling === node) return true;
    return isChildOf(node.parent, parent);
}
