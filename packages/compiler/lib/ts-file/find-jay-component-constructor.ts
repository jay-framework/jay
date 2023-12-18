import ts, {ImportClause, TypeFlags} from "typescript";
import {SourceFileTransformer} from "./mk-transformer.ts";


export interface FindJayComponentConstructorConfig {
    callback: ts.Visitor,
    checker: ts.TypeChecker
}

export const findJayComponentConstructor: SourceFileTransformer<FindJayComponentConstructorConfig> =
    (factory: ts.NodeFactory, context: ts.TransformationContext, {callback, checker}: FindJayComponentConstructorConfig, sourceFile: ts.SourceFile) => {
        const visitor: ts.Visitor = (node) => {
            if (ts.isImportDeclaration(node)) {
                console.log(`import name:`, node.importClause.name?.text);
                let namedBindings = node.importClause.namedBindings;
                if (ts.isNamespaceImport(namedBindings))
                    console.log('namespace imports: ', namedBindings.name.text)
                else if (ts.isNamedImports(namedBindings))
                    namedBindings.elements.forEach(element => {
                        console.log('name binding element:', element.propertyName?.text, element.name.text)
                        let symbol = checker.getSymbolAtLocation(element.name);
                        let symbolType = checker.getTypeOfSymbol(symbol);
                        console.log('  symbolType.flags:', symbolType.flags)
                        if (symbolType.flags && ts.TypeFlags.Object)
                            console.log('symbolType.objectFlags', (symbolType as ts.ObjectType).objectFlags);
                    })

                if (ts.isStringLiteral(node.moduleSpecifier))
                    console.log('Module specifier:', node.moduleSpecifier.text)
            }

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
                            // console.log(componentConstructor);
                            // console.log(checker.getSymbolAtLocation(componentConstructor))
                            return callback(declaration.initializer.expression);
                        }

                    })
            }
            return node
        }
        return ts.visitEachChild(sourceFile, visitor, context);
    }
