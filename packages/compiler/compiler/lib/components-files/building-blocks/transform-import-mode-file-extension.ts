import { getModeFileExtension, RuntimeMode } from '@jay-framework/compiler-shared';
import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const { isStringLiteral } = tsBridge;
import { isRelativeImport } from '../ts-utils/extract-imports';

export function transformImportModeFileExtension(
    node: ts.ImportDeclaration,
    factory: ts.NodeFactory,
    importerMode: RuntimeMode,
): ts.ImportDeclaration {
    if (!isStringLiteral(node.moduleSpecifier)) return undefined;

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
