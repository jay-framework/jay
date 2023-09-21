import ts, { ConstKeyword, LeftHandSideExpression, SyntaxKind } from 'typescript';

function deleteFunctionDeclarations(node: ts.Node) {
    return undefined;
}

function transformVariableStatement(node: ts.VariableStatement, factory: ts.NodeFactory) {
    let declarations = node.declarationList.declarations;
    let newDeclarations = declarations
        .map((declaration) => {
            if (
                declaration.initializer &&
                ts.isCallExpression(declaration.initializer) &&
                ts.isIdentifier(declaration.initializer.expression) &&
                declaration.initializer.expression.escapedText === 'makeJayComponent'
            )
                return factory.createVariableDeclaration(
                    declaration.name,
                    declaration.exclamationToken,
                    declaration.type,
                    factory.createCallExpression(
                        factory.createIdentifier('makeJayComponentBridge'),
                        undefined,
                        [declaration.initializer.arguments[0]],
                    ),
                );
            else return undefined;
        })
        .filter((_) => !!_);
    if (newDeclarations.length > 0)
        return factory.updateVariableStatement(
            node,
            node.modifiers,
            factory.updateVariableDeclarationList(node.declarationList, newDeclarations),
        );
    else return undefined;
}

function transformImport(
    node: ts.ImportDeclaration,
    factory: ts.NodeFactory,
    allowedJayElementModules: string[],
) {
    if (ts.isStringLiteral(node.moduleSpecifier)) {
        const originalTarget = node.moduleSpecifier.text;
        if (originalTarget === 'jay-component')
            return factory.updateImportDeclaration(
                node,
                node.decorators,
                node.modifiers,
                factory.createImportClause(
                    node.importClause.isTypeOnly,
                    node.importClause.name,
                    factory.createNamedImports([
                        factory.createImportSpecifier(
                            false,
                            undefined,
                            factory.createIdentifier('makeJayComponentBridge'),
                        ),
                    ]),
                ),
                // node.importClause,
                factory.createStringLiteral('jay-secure'),
                node.assertClause,
            );
        else if (allowedJayElementModules.indexOf(originalTarget) > -1) {
            return factory.updateImportDeclaration(
                node,
                node.decorators,
                node.modifiers,
                factory.createImportClause(
                    node.importClause.isTypeOnly,
                    node.importClause.name,
                    factory.createNamedImports([
                        factory.createImportSpecifier(
                            false,
                            undefined,
                            factory.createIdentifier('render'),
                        ),
                    ]),
                ),
                // node.importClause,
                factory.createStringLiteral(originalTarget),
                node.assertClause,
            );
        } else return undefined;
    }
    return undefined;
}

export function componentBridgeTransformer(
    allowedJayElementModules: string[],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return (context: ts.TransformationContext) => {
        const { factory } = context;
        return (sourceFile) => {
            return ts.visitEachChild(sourceFile, visitor, context);
        };

        function visitor(node: ts.Node): ts.Node | ts.Node[] | undefined {
            if (ts.isFunctionDeclaration(node)) return undefined;
            else if (ts.isInterfaceDeclaration(node)) return node;
            else if (ts.isImportDeclaration(node))
                return transformImport(node, factory, allowedJayElementModules);
            else if (ts.isVariableStatement(node)) return transformVariableStatement(node, factory);
            return ts.visitEachChild(node, visitor, context);
        }
    };
}
