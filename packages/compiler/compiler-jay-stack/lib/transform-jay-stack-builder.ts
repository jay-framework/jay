import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import {
    SourceFileBindingResolver,
    mkTransformer,
    SourceFileTransformerContext,
} from '@jay-framework/compiler';
import { findBuilderMethodsToRemove } from './building-blocks/find-builder-methods-to-remove';
import { analyzeUnusedStatements } from './building-blocks/analyze-unused-statements';

const {
    createPrinter,
    createSourceFile,
    ScriptTarget,
    visitEachChild,
    isCallExpression,
    isPropertyAccessExpression,
    isImportDeclaration,
    isNamedImports,
} = tsBridge;

export type BuildEnvironment = 'client' | 'server';

type JayStackTransformerConfig = SourceFileTransformerContext & {
    environment: BuildEnvironment;
};

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

    // Transform using mkTransformer pattern
    const transformers = [mkTransformer(mkJayStackCodeSplitTransformer, { environment })];

    const printer = createPrinter();
    const result = tsBridge.transform(sourceFile, transformers);
    const transformedFile = result.transformed[0];
    const transformedCode = printer.printFile(transformedFile as ts.SourceFile);

    result.dispose();

    return {
        code: transformedCode,
    };
}

function mkJayStackCodeSplitTransformer({
    factory,
    sourceFile,
    context,
    environment,
}: JayStackTransformerConfig): ts.SourceFile {
    // Step 1: Create binding resolver
    const bindingResolver = new SourceFileBindingResolver(sourceFile);

    // Step 2: Define which methods belong to which environment
    const SERVER_METHODS = new Set(['withServices', 'withLoadParams', 'withSlowlyRender', 'withFastRender']);
    const CLIENT_METHODS = new Set(['withInteractive', 'withContexts']);

    // Track removed variables during transformation
    const removedVariables = new Set<ReturnType<SourceFileBindingResolver['explain']>>();

    // Step 3: Transform the AST - check and remove method calls during traversal
    const transformVisitor = (node: ts.Node): ts.Node => {
        // First, visit children to handle nested calls
        const visitedNode = visitEachChild(node, transformVisitor, context);
        
        // Then check if THIS node is a builder method call that should be removed
        if (isCallExpression(visitedNode) && isPropertyAccessExpression(visitedNode.expression)) {
            const methodName = visitedNode.expression.name.text;
            const shouldRemove =
                (environment === 'client' && SERVER_METHODS.has(methodName)) ||
                (environment === 'server' && CLIENT_METHODS.has(methodName));

            if (shouldRemove) {
                // Collect variables from arguments for later cleanup
                collectVariablesFromArguments(visitedNode.arguments, bindingResolver, removedVariables);
                
                // Return the receiver (left side of the dot), effectively removing this method call
                return visitedNode.expression.expression;
            }
        }

        return visitedNode;
    };

    let transformedSourceFile = visitEachChild(sourceFile, transformVisitor, context) as ts.SourceFile;

    // Step 4: Analyze which statements are now unused
    const { statementsToRemove, unusedImports } = analyzeUnusedStatements(
        transformedSourceFile,
        removedVariables,
    );

    // Step 5: Remove unused statements and filter imports
    const transformedStatements = transformedSourceFile.statements
        .map((statement) => {
            // Remove statements that are no longer needed
            if (statementsToRemove.has(statement)) {
                return undefined;
            }

            // Filter import declarations
            if (isImportDeclaration(statement)) {
                return filterImportDeclaration(statement, unusedImports, factory);
            }

            return statement;
        })
        .filter((s): s is ts.Statement => s !== undefined);

    return factory.updateSourceFile(transformedSourceFile, transformedStatements);
}

/**
 * Collect variables from method arguments
 */
function collectVariablesFromArguments(
    args: ts.NodeArray<ts.Expression>,
    bindingResolver: SourceFileBindingResolver,
    variables: Set<ReturnType<SourceFileBindingResolver['explain']>>,
) {
    const { isIdentifier } = tsBridge;
    
    const visitor = (node: ts.Node) => {
        if (isIdentifier(node)) {
            const variable = bindingResolver.explain(node);
            if (variable && (variable.name || variable.root)) {
                variables.add(variable);
            }
        }
        node.forEachChild(visitor);
    };

    args.forEach(arg => visitor(arg));
}

/**
 * Filter unused imports from an import declaration
 */
function filterImportDeclaration(
    statement: ts.ImportDeclaration,
    unusedImports: Set<string>,
    factory: ts.NodeFactory,
): ts.ImportDeclaration | undefined {
    const importClause = statement.importClause;
    
    if (!importClause?.namedBindings || !isNamedImports(importClause.namedBindings)) {
        // Keep default imports or namespace imports
        return statement;
    }

    // Filter named imports to exclude unused ones
    const usedElements = importClause.namedBindings.elements.filter(
        element => !unusedImports.has(element.name.text)
    );

    if (usedElements.length === 0) {
        // Remove entire import - no elements are used
        return undefined;
    }

    // Always rebuild the import to ensure proper structure
    return factory.updateImportDeclaration(
        statement,
        statement.modifiers,
        factory.updateImportClause(
            importClause,
            importClause.isTypeOnly,
            importClause.name,
            factory.updateNamedImports(
                importClause.namedBindings,
                usedElements,
            ),
        ),
        statement.moduleSpecifier,
        statement.assertClause,
    );
}
