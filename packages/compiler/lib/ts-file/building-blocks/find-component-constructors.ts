import { SourceFileTransformerContext } from '../mk-transformer.ts';
import ts, {
    Expression, isArrowFunction,
    isFunctionDeclaration,
    isIdentifier,
    isVariableDeclaration,
    isVariableStatement
} from 'typescript';


export type ComponentConstructorDeclaration = ts.FunctionDeclaration | ts.ArrowFunction;

export function findComponentConstructorsBlock(
    componentFunctionExpressions: Expression[],
    { context, sourceFile }: SourceFileTransformerContext,
) {
    const foundConstructors: ComponentConstructorDeclaration[] = [];

    const namedConstructors = new Set(
        componentFunctionExpressions
            .map((expression) => isIdentifier(expression) && expression.text)
            .filter((_) => !!_),
    );

    const findConstructors: ts.Visitor = (node) => {
        if (isFunctionDeclaration(node)) {
            if (namedConstructors.has(node?.name.text))
                foundConstructors.push(node);
        }
        else if (isVariableStatement(node)) {
            node.declarationList.declarations.forEach(declaration => {
                if (isIdentifier(declaration.name) &&
                    namedConstructors.has(declaration.name.text) &&
                    declaration.initializer &&
                    isArrowFunction(declaration.initializer))
                    foundConstructors.push(declaration.initializer);
            })
        }
        return node;
    };

    ts.visitEachChild(sourceFile, findConstructors, context);

    return foundConstructors;
}
