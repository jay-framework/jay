import ts from 'typescript';
import { getModeFileExtension, RuntimeMode } from '../core/runtime-mode';
import { codeToAst, astToCode } from './ts-compiler-utils.ts';
import {mkTransformer, SourceFileTransformerContext} from './mk-transformer.ts';

function transformVariableStatement(
    node: ts.VariableStatement,
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
) {
    let declarations = node.declarationList.declarations;

    let newDeclarations = declarations
        .map((declaration) => {
            if (
                declaration.initializer &&
                ts.isCallExpression(declaration.initializer) &&
                ts.isIdentifier(declaration.initializer.expression) &&
                declaration.initializer.expression.escapedText === 'makeJayComponent'
            ) {
                return `${astToCode(declaration.name)} = makeJayComponentBridge(${astToCode(
                    declaration.initializer.arguments[0],
                )})`;
            } else return undefined;
        })
        .filter((_) => !!_);

    if (newDeclarations.length > 0) {
        let declarationCode = `export const ${newDeclarations.join(', ')}`;
        return codeToAst(declarationCode, context);
    } else return undefined;
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
    context: ts.TransformationContext,
): ts.Node[] {
    if (ts.isStringLiteral(node.moduleSpecifier)) {
        const originalTarget = node.moduleSpecifier.text;
        if (originalTarget === 'jay-component')
            return codeToAst(`import { makeJayComponentBridge } from 'jay-secure';`, context);
        const renderImportSpecifier = getRenderImportSpecifier(node);
        if (Boolean(renderImportSpecifier)) {
            const importModule = `${originalTarget}${getModeFileExtension(true, importerMode)}`;
            return codeToAst(
                `import { ${astToCode(renderImportSpecifier)} } from '${importModule}'`,
                context,
            );
        }
        return undefined;
    }
    return undefined;
}

interface ComponentBridgeTransformerConfig {
    importerMode: RuntimeMode;
}

const mkVisitor = (
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    importerMode: RuntimeMode,
) => {
    const visitor: ts.Visitor = (node) => {
        if (ts.isFunctionDeclaration(node)) return undefined;
        else if (ts.isInterfaceDeclaration(node)) return node;
        else if (ts.isImportDeclaration(node))
            return transformImport(node, factory, importerMode, context);
        else if (ts.isVariableStatement(node))
            return transformVariableStatement(node, factory, context);
        return ts.visitEachChild(node, visitor, context);
    };
    return visitor;
};

function mkSourceFileTransformer(
    {factory, sourceFile, context, importerMode}: SourceFileTransformerContext & ComponentBridgeTransformerConfig
) {
    return ts.visitEachChild(sourceFile, mkVisitor(factory, context, importerMode), context);
}

export function componentBridgeTransformer(
    importerMode: RuntimeMode,
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkSourceFileTransformer, { importerMode });
}
