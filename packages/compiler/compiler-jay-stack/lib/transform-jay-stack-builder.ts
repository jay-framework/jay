import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import {
    SourceFileBindingResolver,
    mkTransformer,
    SourceFileTransformerContext,
    flattenVariable,
    FlattenedAccessChain,
    areFlattenedAccessChainsEqual,
    isImportModuleVariableRoot,
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
    isIdentifier,
    isStringLiteral,
} = tsBridge;

export type BuildEnvironment = 'client' | 'server';

type JayStackTransformerConfig = SourceFileTransformerContext & {
    environment: BuildEnvironment;
    stripBuilders?: Set<string>;
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
    stripBuilders?: Set<string>,
): { code: string; map?: any } {
    // Parse to AST
    const sourceFile = createSourceFile(filePath, code, ScriptTarget.Latest, true);

    // Transform using mkTransformer pattern
    const transformers = [mkTransformer(mkJayStackCodeSplitTransformer, { environment, stripBuilders })];

    const printer = createPrinter();
    const result = tsBridge.transform(sourceFile, transformers);
    const transformedFile = result.transformed[0];
    const transformedCode = printer.printFile(transformedFile as ts.SourceFile);

    result.dispose();

    return {
        code: transformedCode,
    };
}

function isCallToRemove(
    flattened: FlattenedAccessChain,
    callsToRemove: Array<FlattenedAccessChain>,
): boolean {
    return callsToRemove.some((call) => areFlattenedAccessChainsEqual(flattened, call));
}

function mkJayStackCodeSplitTransformer({
    factory,
    sourceFile,
    context,
    environment,
    stripBuilders,
}: JayStackTransformerConfig): ts.SourceFile {
    // Step 1: Create binding resolver
    const bindingResolver = new SourceFileBindingResolver(sourceFile);

    // Step 1b: If stripBuilders is set, remove entire statements rooted in those builders
    let workingSourceFile = sourceFile;
    if (stripBuilders && stripBuilders.size > 0) {
        const filtered = sourceFile.statements.filter((statement) => {
            const rootName = findChainRootBuilderName(statement, bindingResolver);
            return !rootName || !stripBuilders.has(rootName);
        });
        if (filtered.length !== sourceFile.statements.length) {
            workingSourceFile = factory.updateSourceFile(sourceFile, filtered);
        }
    }

    // Step 2: Find all builder methods that should be removed
    const { callsToRemove } = findBuilderMethodsToRemove(workingSourceFile, bindingResolver, environment);

    // Step 3: Transform the AST - remove identified method calls
    // We compare flattened access chains to identify calls that should be removed
    const transformVisitor = (node: ts.Node): ts.Node => {
        // Check if THIS node (BEFORE transformation) is a call that should be removed
        // We must check before visitEachChild because binding resolver only works on original nodes
        if (isCallExpression(node) && isPropertyAccessExpression(node.expression)) {
            const variable = bindingResolver.explain(node.expression);
            const flattened = flattenVariable(variable);

            if (isCallToRemove(flattened, callsToRemove)) {
                // Return the TRANSFORMED receiver (left side of the dot) to handle nested removals
                const receiver = node.expression.expression;
                return transformVisitor(receiver);
            }
        }

        // For all other nodes, visit children normally
        return visitEachChild(node, transformVisitor, context);
    };

    let transformedSourceFile = visitEachChild(
        workingSourceFile,
        transformVisitor,
        context,
    ) as ts.SourceFile;

    // Step 5: Analyze the transformed file and recursively remove unused statements
    // NOTE: analyzeUnusedStatements uses forEachChild (not getChildren) because
    // transformed nodes don't have parent references required by getChildren
    const { statementsToRemove, unusedImports } = analyzeUnusedStatements(transformedSourceFile);

    // Step 6: Remove unused statements and filter imports
    const transformedStatements = transformedSourceFile.statements
        .map((statement) => {
            // Remove statements that are no longer needed
            if (statementsToRemove.has(statement)) {
                return undefined;
            }

            // Filter import declarations to remove unused imports
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
        (element) => !unusedImports.has(element.name.text),
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
            factory.updateNamedImports(importClause.namedBindings, usedElements),
        ),
        statement.moduleSpecifier,
        statement.assertClause,
    );
}

/**
 * Find the root builder function name of a statement's call chain.
 * Returns the builder name (e.g., 'makeJayQuery') if the statement is
 * a variable declaration or expression statement rooted in a builder call,
 * or undefined if it's not a builder chain.
 */
function findChainRootBuilderName(
    statement: ts.Statement,
    bindingResolver: SourceFileBindingResolver,
): string | undefined {
    let expr: ts.Expression | undefined;

    if (tsBridge.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
            if (decl.initializer && isCallExpression(decl.initializer)) {
                expr = decl.initializer;
            }
        }
    }
    if (tsBridge.isExpressionStatement(statement) && isCallExpression(statement.expression)) {
        expr = statement.expression;
    }

    if (!expr) return undefined;

    let current: ts.Expression = expr;
    while (true) {
        if (isCallExpression(current) && isPropertyAccessExpression(current.expression)) {
            current = current.expression.expression;
        } else if (isCallExpression(current) && isIdentifier(current.expression)) {
            const variable = bindingResolver.explain(current.expression);
            const flattened = flattenVariable(variable);
            if (
                flattened.path.length === 1 &&
                isImportModuleVariableRoot(flattened.root) &&
                isStringLiteral(flattened.root.module) &&
                flattened.root.module.text === '@jay-framework/fullstack-component'
            ) {
                return flattened.path[0];
            }
            return undefined;
        } else {
            return undefined;
        }
    }
}
