import ts from 'typescript';
import { getModeFileExtension, RuntimeMode } from '../../core/runtime-mode';
import { isRelativeImport } from '../ts-utils/extract-imports';

export function transformImportModeFileExtension(
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
