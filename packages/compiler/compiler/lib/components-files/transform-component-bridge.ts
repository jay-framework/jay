import { getModeFileExtension, RuntimeMode } from '@jay-framework/compiler-shared';
import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const { SyntaxKind, transform, isStringLiteral, isInterfaceDeclaration, isImportDeclaration } =
    tsBridge;
import { astToCode, codeToAst } from './ts-utils/ts-compiler-utils';
import { mkTransformer, SourceFileTransformerContext } from './ts-utils/mk-transformer';
import { findMakeJayComponentImport } from './building-blocks/find-make-jay-component-import';
import { getImportName } from './ts-utils/extract-imports';
import { MAKE_JAY_COMPONENT } from '@jay-framework/compiler-shared';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions';
import { CompiledPattern } from './basic-analyzers/compile-function-split-patterns';
import { analyzeEventHandlers } from './building-blocks/analyze-event-handlers';
import { SourceFileBindingResolver } from './basic-analyzers/source-file-binding-resolver';
import { SourceFileStatementAnalyzer } from './basic-analyzers/scoped-source-file-statement-analyzer';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
    FoundJayComponentConstructorCall,
} from './building-blocks/find-component-constructor-calls';
import { FunctionRepositoryBuilder } from './building-blocks/function-repository-builder';
import { findExec$ } from './building-blocks/find-exec$';
import { analyseGlobalExec$s } from './building-blocks/analyze-global-exec$';
import { filterEventHandlersToHaveJayEventType } from './building-blocks/filter-event-handlers-to-have-jay-event-type';

function generateComponentConstructorCalls(
    context: ts.TransformationContext,
    componentConstructorCalls: FoundJayComponentConstructorCall[],
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
    const namedBindings = node.importClause?.namedBindings;
    switch (namedBindings?.kind) {
        case SyntaxKind.NamedImports: {
            return namedBindings.elements.find((binding) => getImportName(binding) === 'render');
        }
        default:
            return undefined;
    }
}

function transformImport(
    node: ts.ImportDeclaration,
    importerMode: RuntimeMode,
    context: ts.TransformationContext,
    hasFunctionRepository: boolean,
): ts.Statement {
    if (isStringLiteral(node.moduleSpecifier)) {
        if (findMakeJayComponentImport(MAKE_JAY_COMPONENT, node)) {
            const code = hasFunctionRepository
                ? `import { makeJayComponentBridge, FunctionsRepository } from '@jay-framework/secure';`
                : `import { makeJayComponentBridge } from '@jay-framework/secure';`;
            return codeToAst(code, context)[0] as ts.Statement;
        }
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
        if (node.moduleSpecifier.text === '@jay-framework/runtime') return node;
        if (node.moduleSpecifier.text.endsWith('.css') && !node.importClause) return node;
        return undefined;
    }
    return undefined;
}

interface ComponentBridgeTransformerConfig {
    importerMode: RuntimeMode;
    patterns: CompiledPattern[];
    globalFunctionRepository: FunctionRepositoryBuilder;
}

function transformSourceFile(
    sourceFile: ts.SourceFile,
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    importerMode: RuntimeMode,
    componentConstructorCalls: FoundJayComponentConstructorCall[],
    componentFunctionRepository: FunctionRepositoryBuilder,
) {
    let { functionRepository, hasFunctionRepository } = componentFunctionRepository.generate();

    let generatedComponentConstructorCalls = generateComponentConstructorCalls(
        context,
        componentConstructorCalls,
        hasFunctionRepository,
    );

    let transformedStatements = sourceFile.statements
        .map((statement) => {
            if (isInterfaceDeclaration(statement)) return statement;
            else if (isImportDeclaration(statement))
                return transformImport(statement, importerMode, context, hasFunctionRepository);
            else return undefined;
        })
        .filter((_) => !!_);

    const funcRepositoryStatements = hasFunctionRepository
        ? (codeToAst(functionRepository, context) as ts.Statement[])
        : [];
    let allStatements = [
        ...transformedStatements,
        ...funcRepositoryStatements,
        generatedComponentConstructorCalls,
    ].filter((_) => !!_);

    return factory.updateSourceFile(sourceFile, allStatements);
}

function mkComponentBridgeTransformer({
    factory,
    sourceFile,
    context,
    importerMode,
    patterns,
    globalFunctionRepository,
}: SourceFileTransformerContext & ComponentBridgeTransformerConfig) {
    let bindingResolver = new SourceFileBindingResolver(sourceFile);

    // find the event handlers
    let calls = findComponentConstructorCallsBlock(
        FindComponentConstructorType.makeJayComponent,
        bindingResolver,
        sourceFile,
    );
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sourceFile);
    let foundEventHandlers = constructorDefinitions.flatMap((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition, bindingResolver),
    );
    const elementsEventHandlers = filterEventHandlersToHaveJayEventType(
        foundEventHandlers,
        bindingResolver,
    );

    let analyzer = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns);

    const componentFunctionRepository = new FunctionRepositoryBuilder();
    analyzeEventHandlers(
        context,
        bindingResolver,
        analyzer,
        factory,
        elementsEventHandlers,
        componentFunctionRepository,
    );

    const foundExec$ = findExec$(bindingResolver, sourceFile);
    analyseGlobalExec$s(context, analyzer, globalFunctionRepository, foundExec$);

    return transformSourceFile(
        sourceFile,
        factory,
        context,
        importerMode,
        calls,
        componentFunctionRepository,
    );
}

export function transformComponentBridge(
    importerMode: RuntimeMode,
    patterns: CompiledPattern[] = [],
    globalFunctionRepository: FunctionRepositoryBuilder,
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentBridgeTransformer, {
        importerMode,
        patterns,
        globalFunctionRepository,
    });
}
