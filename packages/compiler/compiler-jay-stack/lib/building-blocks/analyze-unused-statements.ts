import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const {
    isIdentifier,
    isImportDeclaration,
    isFunctionDeclaration,
    isVariableStatement,
    isInterfaceDeclaration,
    isTypeAliasDeclaration,
    isClassDeclaration,
    isEnumDeclaration,
    SyntaxKind,
} = tsBridge;

/**
 * Analysis result for unused statements
 */
export interface UnusedStatementsAnalysis {
    /** Statements that should be removed */
    statementsToRemove: Set<ts.Statement>;
    /** Import identifiers that are no longer used */
    unusedImports: Set<string>;
}

/**
 * Analyze which statements and imports are no longer needed in the transformed file
 * Recursively removes statements that are only used by other removed statements
 *
 * NOTE: This function uses forEachChild (not getChildren) to traverse transformed nodes,
 * since transformed nodes don't have parent references required by getChildren.
 *
 * @param sourceFile - The transformed source file to analyze
 */
export function analyzeUnusedStatements(sourceFile: ts.SourceFile): UnusedStatementsAnalysis {
    const statementsToRemove = new Set<ts.Statement>();

    // Collect all identifiers that are used in non-import, non-removed statements
    const collectUsedIdentifiers = (): Set<string> => {
        const used = new Set<string>();

        for (const statement of sourceFile.statements) {
            // Skip imports (handled separately) and statements marked for removal
            if (isImportDeclaration(statement) || statementsToRemove.has(statement)) {
                continue;
            }

            // Skip the identifier that's being DEFINED by this statement
            const definedName = getStatementDefinedName(statement);

            // Collect all identifiers in this statement
            const visitor = (node: ts.Node, parent?: ts.Node) => {
                if (isIdentifier(node)) {
                    // Skip the function/variable/interface name itself (the definition)
                    if (node.text !== definedName) {
                        used.add(node.text);
                    }
                }
                node.forEachChild((child) => visitor(child, node));
            };
            statement.forEachChild((child) => visitor(child, statement));
        }

        return used;
    };

    // Iteratively remove statements that define identifiers not in use
    let changed = true;
    while (changed) {
        changed = false;
        const stillUsedIdentifiers = collectUsedIdentifiers();

        for (const statement of sourceFile.statements) {
            // Skip already removed, imports, and exports
            if (
                statementsToRemove.has(statement) ||
                isImportDeclaration(statement) ||
                isExportStatement(statement)
            ) {
                continue;
            }

            // Check if this statement defines an identifier that's not used
            const definedName = getStatementDefinedName(statement);
            if (definedName && !stillUsedIdentifiers.has(definedName)) {
                statementsToRemove.add(statement);
                changed = true;
            }
        }
    }

    // Find import identifiers that are no longer used
    const finalUsedIdentifiers = collectUsedIdentifiers();
    const unusedImports = new Set<string>();

    for (const statement of sourceFile.statements) {
        if (isImportDeclaration(statement) && statement.importClause?.namedBindings) {
            const namedBindings = statement.importClause.namedBindings;
            if ('elements' in namedBindings) {
                for (const element of namedBindings.elements) {
                    const importName = element.name.text;

                    // Only mark as unused if it's really not used anywhere
                    if (!finalUsedIdentifiers.has(importName)) {
                        unusedImports.add(importName);
                    }
                }
            }
        }
    }

    return { statementsToRemove, unusedImports };
}

/**
 * Check if a statement is exported
 */
function isExportStatement(statement: ts.Statement): boolean {
    const modifiers = 'modifiers' in statement ? (statement as any).modifiers : undefined;
    if (modifiers) {
        return modifiers.some((mod: ts.Modifier) => mod.kind === SyntaxKind.ExportKeyword);
    }
    return false;
}

/**
 * Get the identifier name defined by a statement (function, variable, interface, type, etc.)
 */
function getStatementDefinedName(statement: ts.Statement): string | undefined {
    if (isFunctionDeclaration(statement) && statement.name) {
        return statement.name.text;
    }
    if (isVariableStatement(statement)) {
        // Get the first variable declaration's name
        const firstDecl = statement.declarationList.declarations[0];
        if (firstDecl && isIdentifier(firstDecl.name)) {
            return firstDecl.name.text;
        }
    }
    if (isInterfaceDeclaration(statement) && statement.name) {
        return statement.name.text;
    }
    if (isTypeAliasDeclaration(statement) && statement.name) {
        return statement.name.text;
    }
    if (isClassDeclaration(statement) && statement.name) {
        return statement.name.text;
    }
    if (isEnumDeclaration(statement) && statement.name) {
        return statement.name.text;
    }
    return undefined;
}
