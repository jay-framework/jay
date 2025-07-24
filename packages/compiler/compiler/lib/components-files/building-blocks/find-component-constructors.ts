import { isFunctionLikeDeclarationBase } from '../ts-utils/ts-compiler-utils';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { forEachChild, isArrowFunction, isFunctionDeclaration, isIdentifier, isVariableStatement,  } = tsModule;

export function findComponentConstructorsBlock(
    componentFunctionExpressions: ts.Expression[],
    sourceFile: ts.SourceFile,
): ts.FunctionLikeDeclarationBase[] {
    const foundConstructors: ts.FunctionLikeDeclarationBase[] = [];

    const namedConstructors = new Set(
        componentFunctionExpressions
            .filter((expression) => isIdentifier(expression))
            .map((expression) => isIdentifier(expression) && expression.text),
    );

    const inlineConstructors = componentFunctionExpressions.filter(
        isFunctionLikeDeclarationBase,
    ) as ts.FunctionLikeDeclarationBase[];

    function visit(node: ts.Node) {
        if (isFunctionDeclaration(node)) {
            if (namedConstructors.has(node?.name.text)) foundConstructors.push(node);
        } else if (isVariableStatement(node)) {
            node.declarationList.declarations.forEach((declaration) => {
                if (
                    isIdentifier(declaration.name) &&
                    namedConstructors.has(declaration.name.text) &&
                    declaration.initializer &&
                    isArrowFunction(declaration.initializer)
                )
                    foundConstructors.push(declaration.initializer);
            });
        }
        forEachChild(node, visit);
    }

    forEachChild(sourceFile, visit);

    return [...foundConstructors, ...inlineConstructors];
}
