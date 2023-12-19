import {SourceFileTransformerContext} from "../mk-transformer.ts";
import ts, {
    Expression,
    isFunctionDeclaration,
    isIdentifier,
} from "typescript";

export function findComponentConstructorsBlock(componentFunctionExpressions: Expression[], {context, sourceFile}: SourceFileTransformerContext) {
    const foundConstructors: ts.Node[] = [];

    const namedConstructors = new Set(componentFunctionExpressions
        .map(expression => isIdentifier(expression) && expression.text)
        .filter(_ => !!_));

    const findConstructors: ts.Visitor = (node) => {
        if (isFunctionDeclaration(node)) {
            if (namedConstructors.has(node?.name.text))
                foundConstructors.push(node);
        }
        return node;
    }

    ts.visitEachChild(sourceFile, findConstructors, context);

    return foundConstructors;
}