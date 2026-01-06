/**
 * Transform action imports for client builds.
 *
 * On the server, action imports remain unchanged (handlers are executed directly).
 * On the client, action imports are replaced with createActionCaller() calls.
 *
 * Example:
 * ```typescript
 * // Source
 * import { addToCart, searchProducts } from '../actions/cart.actions';
 *
 * // Client build output
 * import { createActionCaller } from '@jay-framework/stack-client-runtime';
 * const addToCart = createActionCaller('cart.addToCart', 'POST');
 * const searchProducts = createActionCaller('products.search', 'GET');
 * ```
 */

import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

/**
 * Metadata for a discovered action.
 */
export interface ActionMetadata {
    /** Unique action name (e.g., 'cart.addToCart') */
    actionName: string;
    /** HTTP method */
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Export name in the source module */
    exportName: string;
}

/**
 * Result of extracting actions from a module.
 */
export interface ExtractedActions {
    /** Path to the action module */
    modulePath: string;
    /** Actions exported from this module */
    actions: ActionMetadata[];
}

/**
 * Cache of extracted action metadata by module path.
 */
const actionMetadataCache = new Map<string, ActionMetadata[]>();

/**
 * Clears the action metadata cache (useful for testing/dev reload).
 */
export function clearActionMetadataCache(): void {
    actionMetadataCache.clear();
}

/**
 * Checks if a file path is an action module.
 */
export function isActionModule(filePath: string): boolean {
    return (
        filePath.endsWith('.actions.ts') ||
        filePath.endsWith('.actions.js') ||
        filePath.endsWith('-actions.ts') ||
        filePath.endsWith('-actions.js')
    );
}

/**
 * Checks if an import source refers to an action module.
 */
export function isActionImport(importSource: string): boolean {
    // Match patterns like:
    // - './actions/cart.actions'
    // - '../actions/cart.actions'
    // - '@jay-plugin-store/actions'
    // - 'src/actions/cart.actions'
    // - './mood-actions' (hyphen variant)
    return (
        importSource.includes('.actions') ||
        importSource.includes('-actions') ||
        importSource.includes('/actions/') ||
        importSource.endsWith('/actions')
    );
}

/**
 * Extracts action metadata from source code by parsing makeJayAction/makeJayQuery calls.
 *
 * @param sourceCode - The TypeScript source code
 * @param filePath - Path to the file (for error messages)
 * @returns Array of action metadata
 */
export function extractActionsFromSource(sourceCode: string, filePath: string): ActionMetadata[] {
    // Check cache first
    const cached = actionMetadataCache.get(filePath);
    if (cached) {
        return cached;
    }

    const actions: ActionMetadata[] = [];

    // Parse the source file
    const sourceFile = tsBridge.createSourceFile(
        filePath,
        sourceCode,
        tsBridge.ScriptTarget.Latest,
        true,
    );

    // Find all exported variable declarations with makeJayAction/makeJayQuery
    function visit(node: ts.Node): void {
        // Look for: export const foo = makeJayAction('name')...
        if (tsBridge.isVariableStatement(node)) {
            const hasExport = node.modifiers?.some(
                (m) => m.kind === tsBridge.SyntaxKind.ExportKeyword,
            );
            if (!hasExport) {
                tsBridge.forEachChild(node, visit);
                return;
            }

            for (const decl of node.declarationList.declarations) {
                if (!tsBridge.isIdentifier(decl.name) || !decl.initializer) {
                    continue;
                }

                const exportName = decl.name.text;
                const actionMeta = extractActionFromExpression(decl.initializer);

                if (actionMeta) {
                    actions.push({
                        ...actionMeta,
                        exportName,
                    });
                }
            }
        }

        tsBridge.forEachChild(node, visit);
    }

    visit(sourceFile);

    // Cache the results
    actionMetadataCache.set(filePath, actions);

    return actions;
}

/**
 * Extracts action metadata from a builder chain expression.
 *
 * Handles patterns like:
 * - makeJayAction('cart.addToCart').withHandler(...)
 * - makeJayQuery('products.search').withServices(...).withCaching(...).withHandler(...)
 */
function extractActionFromExpression(
    node: ts.Expression,
): Omit<ActionMetadata, 'exportName'> | null {
    // Walk up call expression chains to find the root makeJayAction/makeJayQuery call
    let current: ts.Expression = node;
    let method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST';
    let explicitMethod: string | null = null;

    while (tsBridge.isCallExpression(current)) {
        const expr = current.expression;

        // Check for .withMethod('GET') etc.
        if (tsBridge.isPropertyAccessExpression(expr) && expr.name.text === 'withMethod') {
            const arg = current.arguments[0];
            if (arg && tsBridge.isStringLiteral(arg)) {
                explicitMethod = arg.text;
            }
            current = expr.expression;
            continue;
        }

        // Check for other builder methods
        if (
            tsBridge.isPropertyAccessExpression(expr) &&
            ['withServices', 'withCaching', 'withHandler', 'withTimeout'].includes(expr.name.text)
        ) {
            current = expr.expression;
            continue;
        }

        // Check for makeJayAction/makeJayQuery root call
        if (tsBridge.isIdentifier(expr)) {
            const funcName = expr.text;
            if (funcName === 'makeJayAction' || funcName === 'makeJayQuery') {
                // Get the action name from first argument
                const nameArg = current.arguments[0];
                if (nameArg && tsBridge.isStringLiteral(nameArg)) {
                    // Default method based on builder type
                    method = funcName === 'makeJayQuery' ? 'GET' : 'POST';

                    // Override with explicit method if specified
                    if (explicitMethod) {
                        method = explicitMethod as typeof method;
                    }

                    return {
                        actionName: nameArg.text,
                        method,
                    };
                }
            }
        }

        break;
    }

    return null;
}

/**
 * Transform result with source map support.
 */
export interface TransformResult {
    code: string;
    map?: any;
}

/**
 * Transforms action imports in client builds.
 *
 * Replaces imports from action modules with createActionCaller() calls.
 *
 * @param code - Source code to transform
 * @param id - Module ID (file path)
 * @param resolveActionModule - Function to resolve and load action module source
 * @returns Transformed code or null if no transform needed
 */
export async function transformActionImports(
    code: string,
    id: string,
    resolveActionModule: (
        importSource: string,
        importer: string,
    ) => Promise<{ path: string; code: string } | null>,
): Promise<TransformResult | null> {
    // Skip if no imports
    if (!code.includes('import')) {
        return null;
    }

    // Parse the source file
    const sourceFile = tsBridge.createSourceFile(id, code, tsBridge.ScriptTarget.Latest, true);

    // Find action imports
    const actionImports: Array<{
        importDecl: ts.ImportDeclaration;
        source: string;
        namedImports: string[];
        start: number;
        end: number;
    }> = [];

    for (const statement of sourceFile.statements) {
        if (!tsBridge.isImportDeclaration(statement)) {
            continue;
        }

        const moduleSpecifier = statement.moduleSpecifier;
        if (!tsBridge.isStringLiteral(moduleSpecifier)) {
            continue;
        }

        const importSource = moduleSpecifier.text;

        // Check if this is an action import
        if (!isActionImport(importSource)) {
            continue;
        }

        // Get named imports
        const importClause = statement.importClause;
        if (!importClause?.namedBindings || !tsBridge.isNamedImports(importClause.namedBindings)) {
            continue; // Skip default imports or namespace imports
        }

        const namedImports = importClause.namedBindings.elements.map((el) =>
            el.propertyName ? el.propertyName.text : el.name.text,
        );

        actionImports.push({
            importDecl: statement,
            source: importSource,
            namedImports,
            start: statement.getStart(),
            end: statement.getEnd(),
        });
    }

    // No action imports found
    if (actionImports.length === 0) {
        return null;
    }

    // Resolve and extract action metadata for each import
    const replacements: Array<{
        start: number;
        end: number;
        replacement: string;
    }> = [];

    let needsCreateActionCallerImport = false;

    for (const imp of actionImports) {
        // Resolve the action module
        const resolved = await resolveActionModule(imp.source, id);
        if (!resolved) {
            console.warn(`[action-transform] Could not resolve action module: ${imp.source}`);
            continue;
        }

        // Extract action metadata from the resolved module
        const actions = extractActionsFromSource(resolved.code, resolved.path);

        // Build replacement code
        const callerDeclarations: string[] = [];

        for (const importName of imp.namedImports) {
            const action = actions.find((a) => a.exportName === importName);
            if (action) {
                callerDeclarations.push(
                    `const ${importName} = createActionCaller('${action.actionName}', '${action.method}');`,
                );
                needsCreateActionCallerImport = true;
            } else {
                // Not an action - might be ActionError or other export
                // Keep the original import for non-action exports
                console.warn(
                    `[action-transform] Export '${importName}' from ${imp.source} is not a recognized action`,
                );
            }
        }

        if (callerDeclarations.length > 0) {
            replacements.push({
                start: imp.start,
                end: imp.end,
                replacement: callerDeclarations.join('\n'),
            });
        }
    }

    if (replacements.length === 0) {
        return null;
    }

    // Apply replacements in reverse order to preserve positions
    let result = code;
    for (const rep of replacements.sort((a, b) => b.start - a.start)) {
        result = result.slice(0, rep.start) + rep.replacement + result.slice(rep.end);
    }

    // Add createActionCaller import at the top
    if (needsCreateActionCallerImport) {
        const importStatement = `import { createActionCaller } from '@jay-framework/stack-client-runtime';\n`;
        result = importStatement + result;
    }

    return { code: result };
}
