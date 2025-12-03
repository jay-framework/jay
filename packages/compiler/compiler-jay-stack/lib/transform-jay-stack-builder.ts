import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import {
    SourceFileBindingResolver,
    mkTransformer,
    SourceFileTransformerContext,
    flattenVariable,
    FlattenedAccessChain,
    areFlattenedAccessChainsEqual,
} from '@jay-framework/compiler';
import {
    addBuildEnvironment,
    isLocalModule,
    hasBuildEnvironment,
    JayBuildEnvironment,
} from '@jay-framework/compiler-shared';
import { findBuilderMethodsToRemove } from './building-blocks/find-builder-methods-to-remove';
import { analyzeUnusedStatements } from './building-blocks/analyze-unused-statements';
import { shouldRemoveMethod } from './building-blocks/check-method-should-remove';
import { visitNode } from 'typescript';

const {
    createPrinter,
    createSourceFile,
    ScriptTarget,
    visitEachChild,
    isCallExpression,
    isPropertyAccessExpression,
    isImportDeclaration,
    isExportDeclaration,
    isNamedImports,
    isIdentifier,
    isFunctionDeclaration,
    isVariableStatement,
    isInterfaceDeclaration,
    isTypeAliasDeclaration,
    isStringLiteral,
} = tsBridge;

export type BuildEnvironment = 'client' | 'server';

// Map our BuildEnvironment to JayBuildEnvironment for the shared utility
function toJayBuildEnvironment(env: BuildEnvironment): JayBuildEnvironment {
    return env === 'client' ? JayBuildEnvironment.Client : JayBuildEnvironment.Server;
}

export interface TransformOptions {
    /** Whether to propagate query params to imports/exports (default: false for SSR, true for package builds) */
    propagateQueryParams?: boolean;
}

type JayStackTransformerConfig = SourceFileTransformerContext & {
    environment: BuildEnvironment;
    propagateQueryParams: boolean;
};

/**
 * Transform Jay Stack component builder chains to strip environment-specific code
 *
 * @param code - Source code to transform
 * @param filePath - File path (for source file creation)
 * @param environment - Target environment ('client' or 'server')
 * @param options - Transform options
 * @returns Transformed code
 */
export function transformJayStackBuilder(
    code: string,
    filePath: string,
    environment: BuildEnvironment,
    options: TransformOptions = {},
): { code: string; map?: any } {
    const { propagateQueryParams = false } = options;

    // Parse to AST
    const sourceFile = createSourceFile(filePath, code, ScriptTarget.Latest, true);

    // Transform using mkTransformer pattern
    const transformers = [
        mkTransformer(mkJayStackCodeSplitTransformer, { environment, propagateQueryParams }),
    ];

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
    propagateQueryParams,
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
        sourceFile,
        transformVisitor,
        context,
    ) as ts.SourceFile;

    // Step 4: Analyze the transformed file and recursively remove unused statements
    // NOTE: analyzeUnusedStatements uses forEachChild (not getChildren) because
    // transformed nodes don't have parent references required by getChildren
    const { statementsToRemove, unusedImports } = analyzeUnusedStatements(transformedSourceFile);

    // Step 5: Remove unused statements and filter/rewrite imports
    // Only propagate query params if explicitly requested (package builds)
    // For dev server SSR, we skip propagation to preserve module identity
    const transformedStatements = transformedSourceFile.statements
        .map((statement) => {
            // Remove statements that are no longer needed
            if (statementsToRemove.has(statement)) {
                return undefined;
            }

            // Filter import declarations
            if (isImportDeclaration(statement)) {
                const filtered = filterImportDeclaration(statement, unusedImports, factory);
                // Only propagate query params when explicitly requested
                return filtered && propagateQueryParams
                    ? rewriteLocalImport(filtered, environment, factory)
                    : filtered;
            }

            // Rewrite export declarations with local module specifiers
            if (isExportDeclaration(statement)) {
                return propagateQueryParams
                    ? rewriteLocalExport(statement, environment, factory)
                    : statement;
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
 * Add query parameter to local import paths using the shared utility
 */
function rewriteLocalImport(
    statement: ts.ImportDeclaration,
    environment: BuildEnvironment,
    factory: ts.NodeFactory,
): ts.ImportDeclaration {
    const moduleSpecifier = statement.moduleSpecifier;

    if (!isStringLiteral(moduleSpecifier)) {
        return statement;
    }

    const modulePath = moduleSpecifier.text;

    // Only rewrite local imports
    if (!isLocalModule(modulePath)) {
        return statement;
    }

    // Skip if already has a build environment query parameter
    if (hasBuildEnvironment(modulePath)) {
        return statement;
    }

    // Add environment-specific query parameter using the shared utility
    const newModulePath = addBuildEnvironment(modulePath, toJayBuildEnvironment(environment));

    return factory.updateImportDeclaration(
        statement,
        statement.modifiers,
        statement.importClause,
        factory.createStringLiteral(newModulePath),
        statement.assertClause,
    );
}

/**
 * Add query parameter to local export paths using the shared utility
 */
function rewriteLocalExport(
    statement: ts.ExportDeclaration,
    environment: BuildEnvironment,
    factory: ts.NodeFactory,
): ts.ExportDeclaration {
    const moduleSpecifier = statement.moduleSpecifier;

    if (!moduleSpecifier || !isStringLiteral(moduleSpecifier)) {
        return statement;
    }

    const modulePath = moduleSpecifier.text;

    // Only rewrite local exports
    if (!isLocalModule(modulePath)) {
        return statement;
    }

    // Skip if already has a build environment query parameter
    if (hasBuildEnvironment(modulePath)) {
        return statement;
    }

    // Add environment-specific query parameter using the shared utility
    const newModulePath = addBuildEnvironment(modulePath, toJayBuildEnvironment(environment));

    return factory.updateExportDeclaration(
        statement,
        statement.modifiers,
        statement.isTypeOnly,
        statement.exportClause,
        factory.createStringLiteral(newModulePath),
        statement.assertClause,
    );
}
