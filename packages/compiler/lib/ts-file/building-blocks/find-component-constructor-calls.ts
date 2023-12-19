import {SourceFileTransformerContext} from "../mk-transformer.ts";
import ts, {Expression, isCallExpression, isIdentifier, isStringLiteral, isVariableStatement} from "typescript";

export interface MakeJayComponentConstructorCalls {
    render: Expression,
    comp: Expression
}

export function findComponentConstructorCalls(makeJayComponentName: string, {context, sourceFile}: SourceFileTransformerContext): MakeJayComponentConstructorCalls[] {

    const foundConstructorCalls: MakeJayComponentConstructorCalls[]  = [];

    const findConstructorNames: ts.Visitor = (node) => {
        if (isVariableStatement(node)) {
            node.declarationList.declarations.forEach(declaration => {
                if (declaration.initializer &&
                    isCallExpression(declaration.initializer) &&
                    isIdentifier(declaration.initializer.expression) &&
                    declaration.initializer.expression.escapedText === makeJayComponentName
                )
                    foundConstructorCalls.push({
                        render: declaration.initializer.arguments[0],
                        comp: declaration.initializer.arguments[1]
                    })
            })
        }
        return node;
    }

    ts.visitEachChild(sourceFile, findConstructorNames, context);

    return foundConstructorCalls;
}