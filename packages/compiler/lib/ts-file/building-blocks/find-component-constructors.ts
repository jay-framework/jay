import ts, {
    Expression,
    FunctionLikeDeclarationBase,
    isArrowFunction,
    isFunctionDeclaration,
    isIdentifier,
    isVariableStatement,
} from 'typescript';
import { isFunctionLikeDeclarationBase } from '../ts-utils/ts-compiler-utils';

export function findComponentConstructorsBlock(
    componentFunctionExpressions: Expression[],
    sourceFile: ts.SourceFile,
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
        ts.forEachChild(node, visit);
    }

    ts.forEachChild(sourceFile, visit);

    return [...foundConstructors, ...inlineConstructors];
}
