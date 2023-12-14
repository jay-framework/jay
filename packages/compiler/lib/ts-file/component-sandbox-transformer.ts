import ts from 'typescript';
import { getModeFileExtension, RuntimeMode } from '../core/runtime-mode';
import { isRelativeImport } from './extract-imports';

export function componentSandboxTransformer(): (
    context: ts.TransformationContext,
) => ts.Transformer<ts.SourceFile> {
    // TODO extract the function references
    return (context: ts.TransformationContext) => {
        const { factory } = context;
        return (sourceFile) => {
            return ts.visitEachChild(sourceFile, visitor, context);
        };

        function visitor(node: ts.Node): ts.Node | ts.Node[] | undefined {
            if (ts.isImportDeclaration(node))
                return transformImport(node, factory, RuntimeMode.WorkerSandbox);
            return ts.visitEachChild(node, visitor, context);
        }
    };
}

function transformImport(
    node: ts.ImportDeclaration,
    factory: ts.NodeFactory,
    importerMode: RuntimeMode,
): ts.ImportDeclaration {
    if (!ts.isStringLiteral(node.moduleSpecifier)) return undefined;

    const originalTarget = node.moduleSpecifier.text;
    if (!isRelativeImport(originalTarget)) return node;

    return factory.updateImportDeclaration(
        node,
        node.modifiers,
        node.importClause,
        factory.createStringLiteral(`${originalTarget}${getModeFileExtension(true, importerMode)}`),
        node.attributes,
    );
}
