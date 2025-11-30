import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import { SourceFileBindingResolver } from '@jay-framework/compiler/lib/components-files/basic-analyzers/source-file-binding-resolver';
import { SourceFileStatementDependencies } from '@jay-framework/compiler/lib/components-files/basic-analyzers/source-file-statement-dependencies';

const {
    transform,
    createPrinter,
    createSourceFile,
    ScriptTarget,
    visitEachChild,
    isCallExpression,
    isPropertyAccessExpression,
    isIdentifier,
    isImportDeclaration,
    factory,
} = tsBridge;

export type BuildEnvironment = 'client' | 'server';

const SERVER_METHODS = new Set([
    'withServices',
    'withLoadParams',
    'withSlowlyRender',
    'withFastRender',
]);

const CLIENT_METHODS = new Set([
    'withInteractive',
    'withContexts',
]);

const SHARED_METHODS = new Set([
    'withProps',
]);

/**
 * Transform Jay Stack component builder chains to strip environment-specific code
 * 
 * @param code - Source code to transform
 * @param filePath - File path (for source file creation)
 * @param environment - Target environment ('client' or 'server')
 * @returns Transformed code
 */
export function transformJayStackBuilder(
    code: string,
    filePath: string,
    environment: BuildEnvironment,
): { code: string; map?: any } {
    // Parse to AST
    const sourceFile = createSourceFile(
        filePath,
        code,
        ScriptTarget.Latest,
        true,
    );

    // Create binding resolver to track identifiers
    const bindingResolver = new SourceFileBindingResolver(sourceFile);

    // Create statement dependencies tracker
    const statementDeps = new SourceFileStatementDependencies(sourceFile, bindingResolver);

    // Transform based on environment
    const result = transform(sourceFile, [
        (context) => mkCodeSplitTransformer(context, bindingResolver, statementDeps, environment),
    ]);

    const printer = createPrinter();
    const transformedFile = result.transformed[0];
    const transformedCode = printer.printFile(transformedFile as ts.SourceFile);

    result.dispose();

    return {
        code: transformedCode,
        // TODO: Generate source map for better debugging
    };
}

function mkCodeSplitTransformer(
    context: ts.TransformationContext,
    bindingResolver: SourceFileBindingResolver,
    statementDeps: SourceFileStatementDependencies,
    environment: BuildEnvironment,
) {
    return (sourceFile: ts.SourceFile): ts.SourceFile => {
        // Track which identifiers are referenced by removed methods
        const removedIdentifiers = new Set<string>();

        // First pass: identify and strip unwanted methods
        const stripMethodsVisitor = (node: ts.Node): ts.Node | undefined => {
            if (isCallExpression(node) && isPropertyAccessExpression(node.expression)) {
                const methodName = node.expression.name.text;

                const shouldRemove =
                    (environment === 'client' && SERVER_METHODS.has(methodName)) ||
                    (environment === 'server' && CLIENT_METHODS.has(methodName));

                if (shouldRemove) {
                    // Track identifiers used in this method call's arguments
                    trackRemovedIdentifiers(node.arguments, bindingResolver, removedIdentifiers);

                    // Return the object being called on (strip this method call)
                    return visitEachChild(node.expression.expression, stripMethodsVisitor, context);
                }
            }

            return visitEachChild(node, stripMethodsVisitor, context);
        };

        let transformedSourceFile = visitEachChild(sourceFile, stripMethodsVisitor, context);

        // Second pass: remove unused imports using statement dependencies
        transformedSourceFile = removeUnusedImports(
            transformedSourceFile,
            context,
            bindingResolver,
            statementDeps,
            removedIdentifiers,
        );

        return transformedSourceFile;
    };
}

/**
 * Track identifiers used in removed method arguments
 * These identifiers' imports may need to be removed
 */
function trackRemovedIdentifiers(
    args: ts.NodeArray<ts.Expression>,
    bindingResolver: SourceFileBindingResolver,
    removedIdentifiers: Set<string>,
) {
    const visitor = (node: ts.Node) => {
        if (isIdentifier(node)) {
            const variable = bindingResolver.explain(node);
            if (variable?.name) {
                removedIdentifiers.add(variable.name);
            }
        }
        node.forEachChild(visitor);
    };

    args.forEach(arg => visitor(arg));
}

/**
 * Remove imports that are no longer used after stripping methods
 */
function removeUnusedImports(
    sourceFile: ts.SourceFile,
    context: ts.TransformationContext,
    bindingResolver: SourceFileBindingResolver,
    statementDeps: SourceFileStatementDependencies,
    removedIdentifiers: Set<string>,
): ts.SourceFile {
    // Collect all identifiers still used in the transformed code
    const stillUsedIdentifiers = new Set<string>();
    
    const collectStillUsed = (node: ts.Node) => {
        if (isIdentifier(node)) {
            stillUsedIdentifiers.add(node.text);
        }
        node.forEachChild(collectStillUsed);
    };
    
    sourceFile.forEachChild(collectStillUsed);

    // Track which import statements to remove
    const statementsToRemove = new Set<ts.Statement>();

    // Check each statement's dependencies
    for (const statementDep of statementDeps.getAllStatements()) {
        const statement = statementDep.statement;

        // Check if this is an import declaration
        if (isImportDeclaration(statement)) {
            const importClause = statement.importClause;
            if (importClause?.namedBindings && tsBridge.isNamedImports(importClause.namedBindings)) {
                const usedElements = importClause.namedBindings.elements.filter(
                    element => stillUsedIdentifiers.has(element.name.text)
                );

                if (usedElements.length === 0) {
                    // No elements from this import are used anymore
                    statementsToRemove.add(statement);
                }
            }
        }
    }

    // Filter and transform statements
    const visitor = (node: ts.Node): ts.Node | undefined => {
        if (statementsToRemove.has(node as ts.Statement)) {
            return undefined; // Remove entire import
        }

        // Handle partially removed imports
        if (isImportDeclaration(node)) {
            const importClause = node.importClause;
            if (importClause?.namedBindings && tsBridge.isNamedImports(importClause.namedBindings)) {
                const usedElements = importClause.namedBindings.elements.filter(
                    element => stillUsedIdentifiers.has(element.name.text)
                );

                const originalCount = importClause.namedBindings.elements.length;
                
                if (usedElements.length > 0 && usedElements.length < originalCount) {
                    // Update import to only include used elements
                    return factory.updateImportDeclaration(
                        node,
                        node.modifiers,
                        factory.updateImportClause(
                            importClause,
                            importClause.isTypeOnly,
                            importClause.name,
                            factory.updateNamedImports(
                                importClause.namedBindings,
                                usedElements
                            )
                        ),
                        node.moduleSpecifier,
                        node.assertClause
                    );
                }
            }
        }

        return visitEachChild(node, visitor, context);
    };

    return visitEachChild(sourceFile, visitor, context) as ts.SourceFile;
}

