import {SourceFileTransformerContext} from "../mk-transformer.ts";
import ts, {Expression, isCallExpression, isIdentifier, isStringLiteral, isVariableStatement} from "typescript";

export function findComponentConstructors(makeJayComponentName: string, {context, sourceFile}: SourceFileTransformerContext) {
    const foundConstructorNames: string[]  = [];

    const findConstructorNames: ts.Visitor = (node) => {
        if (isVariableStatement(node)) {
            node.declarationList.declarations.forEach(declaration => {
                if (declaration.initializer &&
                    isCallExpression(declaration.initializer) &&
                    isIdentifier(declaration.initializer.expression) &&
                    declaration.initializer.expression.escapedText === makeJayComponentName &&
                    isIdentifier(declaration.initializer.arguments[0])
                )
                    foundConstructorNames.push(declaration.initializer.arguments[0].text)
            })
        }
        return node;
    }

    const foundConstructors: ts.Node[] = [];

    const findConstructors: ts.Visitor = (node) => {
        return node;
    }

    ts.visitEachChild(sourceFile, findConstructorNames, context);
    ts.visitEachChild(sourceFile, findConstructors, context);

    return foundConstructorNames;
}