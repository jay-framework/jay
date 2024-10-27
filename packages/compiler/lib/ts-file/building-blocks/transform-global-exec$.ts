import ts, {CallExpression, Expression, ExpressionStatement, isArrowFunction, isExpression} from "typescript";
import {SourceFileStatementAnalyzer} from "../basic-analyzers/scoped-source-file-statement-analyzer";
import {astToCode, codeToAst} from "../ts-utils/ts-compiler-utils";
import {FunctionRepositoryBuilder} from "./function-repository-builder";

export interface TransformedGlobalExec$ {
    wasTransformed: boolean,
    transformedExec$?: ts.CallExpression,
}

export function transformGlobalExec$(
    context: ts.TransformationContext,
    analyzer: SourceFileStatementAnalyzer,
    functionRepositoryBuilder: FunctionRepositoryBuilder,
    foundExec$: ts.CallExpression,
): TransformedGlobalExec$ {
    const scopedAnalyzer = analyzer.analyzeForScope(foundExec$);
    let foundUnsafeExpression = false;
    const visitor: ts.Visitor = (node) => {
        if (isExpression(node)) {
            const matchedPattern = scopedAnalyzer.getExpressionStatus(node);
            foundUnsafeExpression = foundUnsafeExpression || !matchedPattern || !matchedPattern.subExpressionsMatching;
        }
        else {
            node.getChildren().forEach((child) =>
                ts.visitNode(child, visitor))
        }

        return node;
    }

    if (isArrowFunction(foundExec$.arguments[0]))
        ts.visitNode(foundExec$.arguments[0].body, visitor)

    if (foundUnsafeExpression)
        return {wasTransformed: false};
    else {
        const constCode = functionRepositoryBuilder.add(astToCode(foundExec$.arguments[0]))
        const transformedExec$ =
            (codeToAst(`exec$(funcGlobal$('${constCode}'))`, context).map(
                (_: ExpressionStatement) => _.expression,
            ) as Expression[])[0] as CallExpression;
        return {wasTransformed: true, transformedExec$};
    }
}