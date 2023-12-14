import ts from 'typescript';
import { getModeFileExtension, RuntimeMode } from '../core/runtime-mode';

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

function getRenderImportSpecifier(node: ts.ImportDeclaration): ts.ImportSpecifier | undefined {
    const namedBindings = node.importClause.namedBindings;
    switch (namedBindings?.kind) {
        case ts.SyntaxKind.NamedImports: {
            return namedBindings.elements.find((binding) => getImportName(binding) === 'render');
        }
        default:
            return undefined;
    }
}

function getImportName(binding: ts.ImportSpecifier): string {
    return binding.propertyName?.text ?? binding.name.text;
}

function transformImport(
    node: ts.ImportDeclaration,
    factory: ts.NodeFactory,
    importerMode: RuntimeMode,
): ts.ImportDeclaration {
    if (ts.isStringLiteral(node.moduleSpecifier)) {
        const originalTarget = node.moduleSpecifier.text;
        if (originalTarget === 'jay-component')
            return factory.updateImportDeclaration(
                node,
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
                factory.createStringLiteral('jay-secure'),
                node.attributes,
            );
        const renderImportSpecifier = getRenderImportSpecifier(node);
        if (Boolean(renderImportSpecifier)) {
            return factory.updateImportDeclaration(
                node,
                node.modifiers,
                factory.createImportClause(
                    node.importClause.isTypeOnly,
                    node.importClause.name,
                    factory.createNamedImports([renderImportSpecifier]),
                ),
                factory.createStringLiteral(
                    `${originalTarget}${getModeFileExtension(true, importerMode)}`,
                ),
                node.attributes,
            );
        }
        return undefined;
    }
    return undefined;
}

export function componentBridgeTransformer(
    importerMode: RuntimeMode,
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
                return transformImport(node, factory, importerMode);
            else if (ts.isVariableStatement(node)) return transformVariableStatement(node, factory);
            return ts.visitEachChild(node, visitor, context);
        }
    };
}
