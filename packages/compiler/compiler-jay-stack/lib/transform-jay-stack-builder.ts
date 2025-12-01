import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import {
    SourceFileBindingResolver,
    mkTransformer,
    SourceFileTransformerContext, flattenVariable, FlattenedAccessChain,
} from '@jay-framework/compiler';
import { findBuilderMethodsToRemove } from './building-blocks/find-builder-methods-to-remove';
import { analyzeUnusedStatements } from './building-blocks/analyze-unused-statements';
import { shouldRemoveMethod } from './building-blocks/check-method-should-remove';
import {visitNode} from "typescript";

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

function isCallToRemove(flattened: FlattenedAccessChain, callsToRemove: Array<FlattenedAccessChain>) {
    const found = callsToRemove.find(_ => {
        const samePath = flattened.path.length === _.path.length &&
            flattened.path.map((key, index) => key === _.path[index])
                .every(_ => _);
        return samePath;
    })
    return !!found
}

function mkJayStackCodeSplitTransformer({
    factory,
    sourceFile,
    context,
    environment,
}: JayStackTransformerConfig): ts.SourceFile {
    // Step 1: Create binding resolver
    const bindingResolver = new SourceFileBindingResolver(sourceFile);

    // Step 2: Find all builder methods that should be removed
    const { callsToRemove, removedVariables } = findBuilderMethodsToRemove(
        sourceFile,
        bindingResolver,
        environment,
    );

    // Step 3: Transform the AST - remove identified method calls
    // Note: We can't use callsToRemove Set directly because visitEachChild creates new node objects
    // Instead, we check if each method call should be removed using the same validation logic
    const transformVisitor = (node: ts.Node): ts.Node => {

        // Then check if THIS node is a builder method call that should be removed
        if (isCallExpression(node) && isPropertyAccessExpression(node.expression)) {
            // if (callsToRemove.has(visitedNode))
            //     return visitedNode.expression.expression;
            //     console.log(visitedNode.expression.name.text)
            const variable = bindingResolver.explain(node.expression);
            const flattened = flattenVariable(variable);

            if (isCallToRemove(flattened, callsToRemove)) {
                const priorCall = node.expression.expression
                return visitNode(priorCall, transformVisitor, context);
            }

            // const methodName = node.expression.name.text;

            // if (shouldRemoveMethod(methodName, environment)) {
            //     // Return the receiver (left side of the dot), effectively removing this method call
            //     return node.expression.expression;
            // }
        }

        // First, visit children to handle nested calls
        const visitedNode = visitEachChild(node, transformVisitor, context);

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
