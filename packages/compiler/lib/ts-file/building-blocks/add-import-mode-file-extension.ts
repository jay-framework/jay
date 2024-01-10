import ts from "typescript";
import {getModeFileExtension, RuntimeMode} from "../../core/runtime-mode.ts";
import {isRelativeImport} from "../extract-imports.ts";

export function addImportModeFileExtension(
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
