import ts, {
    Expression,
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
    SourceFile,
    Statement
} from "typescript";
import {SourceFileBindingResolver} from "./source-file-binding-resolver.ts";
import {
    CompiledPattern,
    CompilePatternType,
    intersectJayTargetEnv,
    JayTargetEnv
} from "./compile-function-split-patterns.ts";
import {FlattenedAccessChain, flattenVariable, isParamVariableRoot} from "./name-binding-resolver.ts";

export interface MatchedPattern {
    patterns: CompiledPattern[];
    expression: Expression;
    testId: number
}

export interface AnalysisResult {
    targetEnv: JayTargetEnv,
    matchedPatterns: MatchedPattern[]
}

type ContextualVisitor<Context> = (node: ts.Node, context: Context, visitChild: (node: ts.Node, childContext?: Context) => void) => ts.Node;
function visitWithContext<Context>(node: ts.Node, initialContext: Context, contextualVisitor: ContextualVisitor<Context>) {

    let contexts: Context[] = [initialContext];
    const visitChild = (node: ts.Node, childContext?: Context) => {
        if (childContext)
            contexts.push(childContext);
        ts.visitNode(node, visitor);
        if (childContext)
            contexts.pop();
    }
    const visitor = (node: ts.Node): ts.Node => {
        return contextualVisitor(node, contexts.at(-1), visitChild)
    }
    ts.visitNode(node, visitor);
}

export class SourceFileStatementAnalyzer {
    private analyzedStatements = new Map<Statement, AnalysisResult>();
    private analyzedExpressions = new Map<Expression, MatchedPattern>();
    private nextId: number = 0


    constructor(
        private sourceFile: SourceFile,
        private bindingResolver: SourceFileBindingResolver,
        private compiledPatterns: CompiledPattern[]) {
        this.analyze();
    }

    private addPatternToStatement(statement: Statement, matchedPattern: MatchedPattern) {
        if (!this.analyzedStatements.get(statement)) {
            this.analyzedStatements.set(statement, {
                targetEnv: matchedPattern.patterns.reduce((prev, curr) =>
                    intersectJayTargetEnv(prev, curr.targetEnv), JayTargetEnv.any),
                matchedPatterns: [matchedPattern]
            })
        } else {
            let analysisResult = this.analyzedStatements.get(statement);
            analysisResult.matchedPatterns.push(matchedPattern);
            analysisResult.targetEnv = intersectJayTargetEnv(analysisResult.targetEnv,
                matchedPattern.patterns.reduce((prev, curr) =>
                    intersectJayTargetEnv(prev, curr.targetEnv), JayTargetEnv.any))
        }
    }

    private markStatementSandbox(statement: ts.Statement) {
        if (!this.analyzedStatements.get(statement)) {
            this.analyzedStatements.set(statement, {
                targetEnv: JayTargetEnv.sandbox,
                matchedPatterns: []
            })
        }
        else this.analyzedStatements.get(statement).targetEnv = JayTargetEnv.sandbox;
    }

    private analyze() {
        enum RoleInParent {
            none,
            read,
            assign
        }

        interface AnalyzeContext {
            statement?: Statement,
            roleInParent: RoleInParent
        }

        visitWithContext<AnalyzeContext>(this.sourceFile, {roleInParent: RoleInParent.none},
            (node, {statement, roleInParent}, visitChild) => {

                if (isStatement(node))
                    statement = node;

                if (roleInParent === RoleInParent.read || roleInParent === RoleInParent.assign) {
                    if (isIdentifier(node) || isPropertyAccessExpression(node)) {
                        let variable = this.bindingResolver.explain(node);
                        let flattened = flattenVariable(variable);
                        let foundPattern: CompiledPattern[];
                        if (roleInParent === RoleInParent.assign) {
                            foundPattern = this.matchPattern(flattened, CompilePatternType.ASSIGNMENT)
                        }
                        else {
                            foundPattern = this.matchPattern(flattened, CompilePatternType.RETURN)
                        }
                        if (foundPattern.length > 0) {
                            let matchedPattern = {patterns: foundPattern, expression: node, testId: this.nextId++};
                            this.analyzedExpressions.set(node, matchedPattern);
                            this.addPatternToStatement(statement, matchedPattern);
                        }
                        else {
                            if (isPropertyAccessExpression(node))
                                visitChild(node.expression, {statement, roleInParent: RoleInParent.read})
                            this.markStatementSandbox(statement);
                        }
                    }
                    else if (!isLiteralExpression(node))
                        this.markStatementSandbox(statement);
                }

                if (isCallExpression(node) && (isIdentifier(node.expression) || isPropertyAccessExpression(node.expression))) {
                    // analyze the function call arguments
                    node.arguments.forEach(argument =>
                        visitChild(argument, {statement, roleInParent: RoleInParent.read}))
                    // match call expression
                    let variable = this.bindingResolver.explain(node.expression);
                    let flattened = flattenVariable(variable);
                    let foundPattern = this.matchPattern(flattened, CompilePatternType.CALL)
                    let targetEnv: JayTargetEnv = foundPattern.length > 0 ? JayTargetEnv.any : JayTargetEnv.sandbox;
                    // verify parameters
                    if (targetEnv === JayTargetEnv.any) {
                        // check also arguments types are matching the pattern
                        node.arguments.forEach((argument, index) => {
                            let argumentMatchedPattern = this.getExpressionStatus(argument);
                            if (argumentMatchedPattern.patterns.length > 0 &&
                                argumentMatchedPattern.patterns[0].returnType === foundPattern[0].callArgumentTypes[index]) {
                                targetEnv = intersectJayTargetEnv(targetEnv, argumentMatchedPattern.patterns[0].targetEnv)
                            }
                            else
                                targetEnv = JayTargetEnv.sandbox;
                        })
                    }
                    // @ts-ignore - for some reason TS thinks targetEnv cannot be JayTargetEnv.main.
                    if ((targetEnv === JayTargetEnv.any) || (targetEnv === JayTargetEnv.main)) {
                        let matchedPattern = {patterns: foundPattern, expression: node, testId: this.nextId++};
                        this.analyzedExpressions.set(node, matchedPattern);
                        this.addPatternToStatement(statement, matchedPattern);
                    }
                    else {
                        if (isPropertyAccessExpression(node.expression))
                            visitChild(node.expression.expression, {statement, roleInParent: RoleInParent.read})
                        this.markStatementSandbox(statement);
                    }
                } else if (isVariableStatement(node)) {
                    node.declarationList.declarations.forEach(declaration =>
                        visitChild(declaration.initializer, {statement, roleInParent: RoleInParent.read}));
                } else if (isArrowFunction(node) && !isBlock(node.body)) {
                    visitChild(node.body, {statement, roleInParent: RoleInParent.read});
                } else if (isIfStatement(node)) {
                    visitChild(node.expression, {statement, roleInParent: RoleInParent.read})
                    visitChild(node.thenStatement, {statement, roleInParent: RoleInParent.none})
                    if (node.elseStatement)
                        visitChild(node.elseStatement, {statement, roleInParent: RoleInParent.none})
                } else if (isForStatement(node) || isForOfStatement(node) || isForInStatement(node) || isWhileStatement(node) || isDoStatement(node)) {
                    this.markStatementSandbox(statement)
                    // if (isVariableDeclarationList(node.initializer))
                    //     node.initializer.declarations.forEach(child =>
                    //         visitChild(child.initializer, {statement, roleInParent: RoleInParent.read}))
                    // else
                    //     visitChild(node.initializer, {statement, roleInParent: RoleInParent.read})
                    // visitChild(node.condition, {statement, roleInParent: RoleInParent.none})
                    // visitChild(node.incrementor, {statement, roleInParent: RoleInParent.none})
                    // visitChild(node.statement, {statement, roleInParent: RoleInParent.none})
                } else if (isBinaryExpression(node)) {
                    visitChild(node.right, {statement, roleInParent: RoleInParent.read})
                    visitChild(node.left, {
                        statement, roleInParent:
                            (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) ? RoleInParent.assign : RoleInParent.read
                    })
                } else {
                    node.getChildren().forEach(child =>
                        visitChild(child, {statement, roleInParent: RoleInParent.none}));
                }
                return node;
        })


    }

    private matchPattern(
        resolvedParam: FlattenedAccessChain,
        expectedPatternType: CompilePatternType
    ): CompiledPattern[] {
        let matchedPatterns = []
        if (resolvedParam.root && isParamVariableRoot(resolvedParam.root)) {
            let currentVariableType = this.bindingResolver.explainType(resolvedParam.root.param.type)
            let currentPosition = 0;

            while (currentPosition < resolvedParam.path.length) {
                let currentMatch = this.compiledPatterns
                    .find(
                        (pattern) => {
                            let leftTypeMatch = currentVariableType === pattern.leftSideType;
                            let pathMatch = currentPosition + pattern.leftSidePath.length <= resolvedParam.path.length &&
                                pattern.leftSidePath.every(
                                    (element, index) => element === resolvedParam.path[index + currentPosition],
                                );
                            let expectedTypeMatch = (currentPosition + pattern.leftSidePath.length === resolvedParam.path.length)?
                                pattern.patternType === expectedPatternType :
                                pattern.patternType === CompilePatternType.RETURN;
                            return leftTypeMatch && pathMatch && expectedTypeMatch;
                        });
                if (currentMatch) {
                    matchedPatterns.push(currentMatch);
                    if (currentMatch.leftSidePath.length < resolvedParam.path.length) {
                        currentVariableType = currentMatch.returnType;
                        currentPosition += currentMatch.leftSidePath.length;

                    }
                    else
                        return matchedPatterns

                }
                else
                    return [];
            }
        }
        return matchedPatterns;
    }

    getExpressionStatus(expression: Expression): MatchedPattern {
        return this.analyzedExpressions.get(expression);
    }
    getStatementStatus(statement: Statement): AnalysisResult {
        return this.analyzedStatements.get(statement);
    }

    getMatchedExpressions() {
        return this.analyzedExpressions.keys()
    }

    getAnalyzedStatements() {
        return this.analyzedStatements.keys()
    }
}