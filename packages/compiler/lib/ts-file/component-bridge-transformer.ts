import ts, {TransformationContext} from 'typescript';
import {getModeFileExtension, RuntimeMode} from '../core/runtime-mode';
import {astToCode, codeToAst} from './ts-compiler-utils';
import {mkTransformer, SourceFileTransformerContext} from './mk-transformer';
import {
    findMakeJayComponentImport,
    findMakeJayComponentImportTransformerBlock,
} from './building-blocks/find-make-jay-component-import';
import {
    findComponentConstructorCallsBlock,
    MakeJayComponentConstructorCalls,
} from './building-blocks/find-component-constructor-calls';
import {getImportName} from './extract-imports';
import {MAKE_JAY_COMPONENT} from '../core/constants';
import {findComponentConstructorsBlock} from './building-blocks/find-component-constructors.ts';
import {findEventHandlersBlock} from './building-blocks/find-event-handler-functions.ts';
import {CompiledPattern} from './building-blocks/compile-function-split-patterns.ts';
import {TransformedEventHandlers, transformEventHandlers,} from './building-blocks/transform-event-handlers.ts';
import {findAfterImportStatementIndex} from "./building-blocks/find-after-import-statement-index.ts";

function transformVariableStatement(
    node: ts.VariableStatement,
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    componentConstructorCalls: MakeJayComponentConstructorCalls[],
    hasFunctionRepository: boolean,
): ts.Statement {
    let optionsParam = hasFunctionRepository ? ', { funcRepository }' : '';
    let transformedConstructors = componentConstructorCalls.map(({ name, render }) => {
        return `${astToCode(name)} = makeJayComponentBridge(${astToCode(render)}${optionsParam})`;
    });

    if (transformedConstructors.length > 0) {
        let declarationCode = `export const ${transformedConstructors.join(', ')}`;
        return codeToAst(declarationCode, context)[0] as ts.Statement;
    } else return undefined;
}

function getRenderImportSpecifier(node: ts.ImportDeclaration): ts.ImportSpecifier | undefined {
    const namedBindings = node.importClause.namedBindings;
    switch (namedBindings?.kind) {
        case ts.SyntaxKind.NamedImports: {
            return namedBindings.elements.find((binding) => getImportName(binding) === 'render');
        }
        default:
            return undefined;
    }
}

function transformImport(
    node: ts.ImportDeclaration,
    factory: ts.NodeFactory,
    importerMode: RuntimeMode,
    context: ts.TransformationContext,
): ts.Statement {
    if (ts.isStringLiteral(node.moduleSpecifier)) {
        if (findMakeJayComponentImport(MAKE_JAY_COMPONENT, node))
            return codeToAst(
                `import { makeJayComponentBridge } from 'jay-secure';`,
                context,
            )[0] as ts.Statement;
        const renderImportSpecifier = getRenderImportSpecifier(node);
        if (Boolean(renderImportSpecifier)) {
            const importModule = `${node.moduleSpecifier.text}${getModeFileExtension(
                true,
                importerMode,
            )}`;
            return codeToAst(
                `import { ${astToCode(renderImportSpecifier)} } from '${importModule}'`,
                context,
            )[0] as ts.Statement;
        }
        return undefined;
    }
    return undefined;
}

interface ComponentBridgeTransformerConfig {
    importerMode: RuntimeMode;
    patterns: CompiledPattern[];
}

function generateFunctionRepository(
    transformedEventHandlers: TransformedEventHandlers,
    context: TransformationContext,
): { hasFunctionRepository: boolean; functionRepository?: ts.Statement } {
    let functionRepositoryFragments = transformedEventHandlers.getAllFunctionRepositoryFragments();
    if (functionRepositoryFragments.length > 0) {
        let fragments = functionRepositoryFragments
            .map((_) => `'${_.handlerIndex}': ${_.fragment}`)
            .join(',\n');
        let functionRepository = `const funcRepository: FunctionsRepository = {\n${fragments}\n};`;
        return {
            functionRepository: codeToAst(functionRepository, context)[0] as ts.Statement,
            hasFunctionRepository: true,
        };
    } else return { hasFunctionRepository: false };
}

function transformSourceFile(
    sourceFile: ts.SourceFile,
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    importerMode: RuntimeMode,
    componentConstructorCalls: MakeJayComponentConstructorCalls[],
    transformedEventHandlers: TransformedEventHandlers,
) {
    let { functionRepository, hasFunctionRepository } = generateFunctionRepository(
        transformedEventHandlers,
        context,
    );

    let transformedStatements = sourceFile.statements
        .map((statement) => {
            if (ts.isFunctionDeclaration(statement)) return undefined;
            else if (ts.isInterfaceDeclaration(statement)) return statement;
            else if (ts.isImportDeclaration(statement))
                return transformImport(statement, factory, importerMode, context);
            else if (ts.isVariableStatement(statement))
                return transformVariableStatement(
                    statement,
                    factory,
                    context,
                    componentConstructorCalls,
                    hasFunctionRepository,
                );
            else return undefined;
        })
        .filter((_) => !!_);

    if (hasFunctionRepository) {
        let afterImportStatementIndex = findAfterImportStatementIndex(transformedStatements);

        let allStatements = [
            ...transformedStatements.slice(0, afterImportStatementIndex),
            functionRepository,
            ...transformedStatements.slice(afterImportStatementIndex),
        ];

        return factory.updateSourceFile(sourceFile, allStatements);
    } else return factory.updateSourceFile(sourceFile, transformedStatements);
}

function mkSourceFileTransformer({
    factory,
    sourceFile,
    context,
    importerMode,
    patterns,
}: SourceFileTransformerContext & ComponentBridgeTransformerConfig) {
    // find the event handlers
    let makeJayComponent_ImportName = findMakeJayComponentImportTransformerBlock(
        MAKE_JAY_COMPONENT,
        sourceFile,
    );

    let calls = findComponentConstructorCallsBlock(makeJayComponent_ImportName, sourceFile);
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sourceFile);
    let foundEventHandlers = constructorDefinitions.flatMap((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition),
    );

    let transformedEventHandlers = new TransformedEventHandlers(
        transformEventHandlers(context, patterns, factory, foundEventHandlers),
    );

    return transformSourceFile(
        sourceFile,
        factory,
        context,
        importerMode,
        calls,
        transformedEventHandlers,
    );
}

export function componentBridgeTransformer(
    importerMode: RuntimeMode,
    patterns: CompiledPattern[] = [],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkSourceFileTransformer, { importerMode, patterns });
}
