import ts from "typescript";
import {TransformationVisitor, Visitor} from "./mk-transformer.ts";


export interface FindJayComponentConstructorConfig {
    callback: Visitor
    checker: ts.TypeChecker
}

export const findJayComponentConstructor: TransformationVisitor<FindJayComponentConstructorConfig> =
    (factory: ts.NodeFactory, context: ts.TransformationContext, {callback, checker}: FindJayComponentConstructorConfig) => {
    const visitor: Visitor = (node) => {
        if (ts.isVariableStatement(node)) {
            let declarations = node.declarationList.declarations;
            declarations
                .map((declaration) => {
                    if (
                        declaration.initializer &&
                        ts.isCallExpression(declaration.initializer) &&
                        ts.isIdentifier(declaration.initializer.expression) &&
                        declaration.initializer.expression.escapedText === 'makeJayComponent'
                    ) {
                        let componentConstructor = declaration.initializer.arguments[1];
                        console.log(componentConstructor);
                        console.log(checker.getSymbolAtLocation(componentConstructor))
                        return callback(declaration.initializer.expression);
                    }

                })
        }
        return node
    }
    return visitor;
}
