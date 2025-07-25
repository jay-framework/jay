import { SourceFileStatementAnalyzer } from '../basic-analyzers/scoped-source-file-statement-analyzer';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { visitNode, isArrowFunction, isExpression } = tsModule;
import { astToCode, codeToAst } from '../ts-utils/ts-compiler-utils';
import { FunctionRepositoryBuilder } from './function-repository-builder';

export interface TransformedGlobalExec$ {
    wasTransformed: boolean;
    foundExec$: ts.CallExpression;
    transformedExec$?: ts.CallExpression;
}

export function analyzeGlobalExec$(
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
            foundUnsafeExpression =
                foundUnsafeExpression || !matchedPattern || !matchedPattern.subExpressionsMatching;
        } else {
            node.getChildren().forEach((child) => visitNode(child, visitor));
        }

        return node;
    };

    if (isArrowFunction(foundExec$.arguments[0])) visitNode(foundExec$.arguments[0].body, visitor);

    if (foundUnsafeExpression) return { foundExec$, wasTransformed: false };
    else {
        const key = functionRepositoryBuilder.addFunction(astToCode(foundExec$.arguments[0]));
        const transformedExec$ = (
            codeToAst(`exec$(funcGlobal$('${key}'))`, context).map(
                (_: ts.ExpressionStatement) => _.expression,
            ) as ts.Expression[]
        )[0] as ts.CallExpression;
        return { foundExec$, wasTransformed: true, transformedExec$ };
    }
}

export function analyseGlobalExec$s(
    context: ts.TransformationContext,
    analyzer: SourceFileStatementAnalyzer,
    functionRepositoryBuilder: FunctionRepositoryBuilder,
    foundExec$s: ts.CallExpression[],
): TransformedGlobalExec$[] {
    return foundExec$s.map((foundExec$) =>
        analyzeGlobalExec$(context, analyzer, functionRepositoryBuilder, foundExec$),
    );
}

export function transformedGlobalExec$toReplaceMap(
    transformedGlobalExec$s: TransformedGlobalExec$[],
): Map<ts.Node, ts.Node> {
    const map = new Map<ts.Node, ts.Node>();
    transformedGlobalExec$s
        .filter((_) => _.wasTransformed)
        .forEach((_) => {
            map.set(_.foundExec$, _.transformedExec$);
        });
    return map;
}
