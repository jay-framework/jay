import ts, {
    CallExpression,
    Expression,
    ExpressionStatement,
    isArrowFunction,
    isCallExpression, isExpression,
    isFunctionDeclaration
} from "typescript";
import {SourceFileStatementAnalyzer} from "../basic-analyzers/scoped-source-file-statement-analyzer";
import {codeToAst} from "../ts-utils/ts-compiler-utils";

export interface TransformedGlobalExec$ {
    wasTransformed: boolean,
    globalExec$index?: number,
    transformedExec$?: ts.CallExpression,
    functionRepositoryExpression?: ts.Expression;
}

let nextIndex:number = 0;
export function transformGlobalExec$(
    context: ts.TransformationContext,
    analyzer: SourceFileStatementAnalyzer,
    foundExec$: ts.CallExpression,
): TransformedGlobalExec$ {
    const scopedAnalyzer = analyzer.analyzeForScope(foundExec$);
    if (isArrowFunction(foundExec$.arguments[0]) &&     // todo support regular functions
        isExpression(foundExec$.arguments[0].body)) {   // todo support block
        const subject = foundExec$.arguments[0].body;
        const matchedPattern = scopedAnalyzer.getExpressionStatus(subject);
        if (matchedPattern) {
            const globalExec$index = nextIndex++;
            const transformedExec$ =
                (codeToAst(`exec$(funcGlobal$('${globalExec$index}'))`, context).map(
                    (_: ExpressionStatement) => _.expression,
                ) as Expression[])[0] as CallExpression;
            const functionRepositoryExpression = foundExec$.arguments[0];
            return {wasTransformed: false, globalExec$index, transformedExec$, functionRepositoryExpression};
        }
    }
    return {wasTransformed: false};

}