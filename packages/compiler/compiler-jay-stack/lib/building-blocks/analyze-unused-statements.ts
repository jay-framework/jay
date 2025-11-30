import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import { SourceFileBindingResolver } from '@jay-framework/compiler';

const { isIdentifier, isImportDeclaration, SyntaxKind } = tsBridge;

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
 * Analyze which statements and imports are no longer needed after removing variables
 */
export function analyzeUnusedStatements(
    sourceFile: ts.SourceFile,
    removedVariables: Set<ReturnType<SourceFileBindingResolver['explain']>>,
): UnusedStatementsAnalysis {
    const statementsToRemove = new Set<ts.Statement>();

    // Find statements that define the removed variables
    for (const variable of removedVariables) {
        if (variable?.definingStatement) {
            // Never remove import declarations here - they're handled separately
            // via the unusedImports mechanism
            if (isImportDeclaration(variable.definingStatement)) {
                continue;
            }
            
            // Only remove if it's not an export
            if (!isExportStatement(variable.definingStatement)) {
                statementsToRemove.add(variable.definingStatement);
            }
        }
    }

    // Collect all identifiers still used in non-removed, non-import statements
    const stillUsedIdentifiers = new Set<string>();

    for (const statement of sourceFile.statements) {
        // Skip import declarations and statements we're removing
        if (isImportDeclaration(statement) || statementsToRemove.has(statement)) {
            continue;
        }

        collectUsedIdentifiers(statement, stillUsedIdentifiers);
    }

    // Find import identifiers that are no longer used
    const unusedImports = new Set<string>();
    
    for (const statement of sourceFile.statements) {
        if (isImportDeclaration(statement) && statement.importClause?.namedBindings) {
            const namedBindings = statement.importClause.namedBindings;
            if ('elements' in namedBindings) {
                for (const element of namedBindings.elements) {
                    const importName = element.name.text;
                    
                    // Only mark as unused if it's really not used anywhere
                    if (!stillUsedIdentifiers.has(importName)) {
                        unusedImports.add(importName);
                    }
                }
            }
        }
    }

    return { statementsToRemove, unusedImports };
}

/**
 * Collect all identifiers used in a node
 */
function collectUsedIdentifiers(node: ts.Node, identifiers: Set<string>) {
    if (isIdentifier(node)) {
        identifiers.add(node.text);
    }
    node.forEachChild(child => collectUsedIdentifiers(child, identifiers));
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

