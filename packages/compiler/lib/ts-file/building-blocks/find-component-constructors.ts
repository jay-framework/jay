import { SourceFileTransformerContext } from '../mk-transformer.ts';
import ts, {
    Expression,
    FunctionLikeDeclarationBase,
    isArrowFunction,
    isFunctionDeclaration,
    isIdentifier,
    isVariableStatement,
} from 'typescript';
import { isFunctionLikeDeclarationBase } from '../ts-compiler-utils.ts';

export function findComponentConstructorsBlock(
    componentFunctionExpressions: Expression[],
    { context, sourceFile }: SourceFileTransformerContext,
): FunctionLikeDeclarationBase[] {
    const foundConstructors: FunctionLikeDeclarationBase[] = [];

    const namedConstructors = new Set(
        componentFunctionExpressions
            .filter((expression) => isIdentifier(expression))
            .map((expression) => isIdentifier(expression) && expression.text),
    );

    const inlineConstructors = componentFunctionExpressions.filter(
        isFunctionLikeDeclarationBase,
    ) as FunctionLikeDeclarationBase[];

    const findConstructors: ts.Visitor = (node) => {
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
        return node;
    };

    ts.visitEachChild(sourceFile, findConstructors, context);

    return [...foundConstructors, ...inlineConstructors];
}
