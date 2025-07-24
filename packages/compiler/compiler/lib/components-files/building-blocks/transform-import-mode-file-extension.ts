import { getModeFileExtension, RuntimeMode } from '@jay-framework/compiler-shared';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { isStringLiteral } = tsModule;
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
