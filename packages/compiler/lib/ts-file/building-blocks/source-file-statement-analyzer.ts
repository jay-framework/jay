import ts, {
    Expression,
    isArrowFunction,
    isBlock,
    isCallExpression,
    isIdentifier,
    isPropertyAccessExpression,
    isStatement,
    isVariableStatement,
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

interface MatchedPattern {
    pattern: CompiledPattern;
    expression: Expression;
}

interface AnalysisResult {
    targetEnv: JayTargetEnv,
    matchingReadPatterns: MatchedPattern[]
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
    private analyzedStatements = new Map<ts.Node, AnalysisResult>();
    private analyzedExpressions = new Map<ts.Node, MatchedPattern>();


    constructor(
        private sourceFile: SourceFile,
        private bindingResolver: SourceFileBindingResolver,
        private compiledPatterns: CompiledPattern[]) {

        this.analyze();
    }

    private addPatternToStatement(statement: Statement, matchedPattern: MatchedPattern) {
        if (!this.analyzedStatements.get(statement)) {
            this.analyzedStatements.set(statement, {
                targetEnv: matchedPattern.pattern.targetEnv,
                matchingReadPatterns: [matchedPattern]
            })
        } else {
            let analysisResult = this.analyzedStatements.get(statement);
            analysisResult.matchingReadPatterns.push(matchedPattern);
            analysisResult.targetEnv = intersectJayTargetEnv(analysisResult.targetEnv, matchedPattern.pattern.targetEnv)
        }
    }

    private markStatementSandbox(statement: ts.Statement) {
        if (!this.analyzedStatements.get(statement)) {
            this.analyzedStatements.set(statement, {
                targetEnv: JayTargetEnv.sandbox,
                matchingReadPatterns: []
            })
        }
        else this.analyzedStatements.get(statement).targetEnv = JayTargetEnv.sandbox;
    }

    private analyze() {
        enum RoleInParent {
            none,
            read
        }

        interface AnalyzeContext {
            statement?: Statement,
            roleInParent: RoleInParent
        }
        visitWithContext<AnalyzeContext>(this.sourceFile, {roleInParent: RoleInParent.none},
            (node, {statement, roleInParent}, visitChild) => {

                if (isStatement(node))
                    statement = node;

                if (roleInParent === RoleInParent.read) {
                    if (isIdentifier(node) || isPropertyAccessExpression(node)) {
                        let variable = this.bindingResolver.explain(node);
                        let flattened = flattenVariable(variable);
                        let foundPattern = this.findPatternInVariable(flattened, CompilePatternType.RETURN);
                        if (foundPattern) {
                            let matchedPattern = {pattern: foundPattern, expression: node};
                            this.analyzedExpressions.set(node, matchedPattern);
                            this.addPatternToStatement(statement, matchedPattern);
                        }
                        else {
                            this.markStatementSandbox(statement);
                        }
                    }

                }

                if (isCallExpression(node)) {
                    visitChild(node.expression, {statement, roleInParent: RoleInParent.read})
                    node.arguments.forEach(argument =>
                        visitChild(argument, {statement, roleInParent: RoleInParent.read}))
                } else if (isVariableStatement(node)) {
                    node.declarationList.declarations.forEach(declaration =>
                        visitChild(declaration.initializer, {statement, roleInParent: RoleInParent.read}));
                } else if (isArrowFunction(node) && !isBlock(node.body)) {
                    visitChild(node.body, {statement, roleInParent: RoleInParent.read});
                } else {
                    node.getChildren().forEach(child =>
                        visitChild(child, {statement, roleInParent: RoleInParent.none}));
                }
                return node;
        })


    }

    findPatternInVariable(
        resolvedParam: FlattenedAccessChain,
        patternTypeToFind: CompilePatternType,
    ): CompiledPattern {
        return this.compiledPatterns
            .filter((pattern) => pattern.patternType === patternTypeToFind)
            .find(
                (pattern) => {
                    if (resolvedParam.root && isParamVariableRoot(resolvedParam.root)) {
                        let variableType = this.bindingResolver.explainType(resolvedParam.root.param.type)

                        let match = variableType === pattern.leftSideType &&
                            pattern.leftSidePath.length <= resolvedParam.path.length &&
                            pattern.leftSidePath.every(
                                (element, index) => element === resolvedParam.path[index],
                            )
                        return match;
                    }
                });
    }

    getExpressionStatus(expression: Expression): MatchedPattern {
        return this.analyzedExpressions.get(expression);
    }
    getStatementStatus(statement: Statement): AnalysisResult {
        return this.analyzedStatements.get(statement);
    }

}