import ts, { Statement, TransformationContext } from 'typescript';
import { getModeFileExtension, RuntimeMode } from '../core/runtime-mode';
import { astToCode, codeToAst } from './ts-compiler-utils';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import {
    findMakeJayComponentImport,
    findMakeJayComponentImportTransformerBlock,
} from './building-blocks/find-make-jay-component-import';
import { getImportName } from './extract-imports';
import { MAKE_JAY_COMPONENT } from '../core/constants';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions';
import { CompiledPattern } from './building-blocks/compile-function-split-patterns';
import {
    TransformedEventHandlers,
    transformEventHandlers,
} from './building-blocks/transform-event-handlers';
import {
    findMakeJayComponentConstructorCallsBlock,
    MakeJayComponentConstructorCalls,
} from './building-blocks/find-make-jay-component-constructor-calls';
import { SourceFileBindingResolver } from './building-blocks/source-file-binding-resolver.ts';
import { SourceFileStatementAnalyzer } from './building-blocks/source-file-statement-analyzer.ts';

function generateComponentConstructorCalls(
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
    const namedBindings = node.importClause?.namedBindings;
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
    hasFunctionRepository: boolean,
): ts.Statement {
    if (ts.isStringLiteral(node.moduleSpecifier)) {
        if (findMakeJayComponentImport(MAKE_JAY_COMPONENT, node)) {
            const code = hasFunctionRepository
                ? `import { makeJayComponentBridge, FunctionsRepository } from 'jay-secure';`
                : `import { makeJayComponentBridge } from 'jay-secure';`;
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
        if (node.moduleSpecifier.text === 'jay-runtime') return node;
        if (node.moduleSpecifier.text.endsWith('.css') && !node.importClause) return node;
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
): { hasFunctionRepository: boolean; functionRepository: Statement[] } {
    let functionRepositoryFragments = transformedEventHandlers.getAllFunctionRepositoryFragments();
    if (functionRepositoryFragments.length > 0) {
        let fragments = functionRepositoryFragments
            .map((_) => `'${_.handlerIndex}': ${_.fragment.handlerCode}`)
            .join(',\n');

        let constants = functionRepositoryFragments.map((_) => _.fragment.constCode);
        let uniqueConstants = [...new Set(constants)];
        let constantsCodeFragment =
            uniqueConstants.length > 0 ? uniqueConstants.join('\n') + '\n\n' : '';

        let functionRepository = `${constantsCodeFragment}const funcRepository: FunctionsRepository = {\n${fragments}\n};`;

        return {
            functionRepository: codeToAst(functionRepository, context) as Statement[],
            hasFunctionRepository: true,
        };
    } else return { hasFunctionRepository: false, functionRepository: [] };
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

    let generatedComponentConstructorCalls = generateComponentConstructorCalls(
        context,
        componentConstructorCalls,
        hasFunctionRepository,
    );

    let transformedStatements = sourceFile.statements
        .map((statement) => {
            if (ts.isInterfaceDeclaration(statement)) return statement;
            else if (ts.isImportDeclaration(statement))
                return transformImport(
                    statement,
                    factory,
                    importerMode,
                    context,
                    hasFunctionRepository,
                );
            else return undefined;
        })
        .filter((_) => !!_);

    let allStatements = [
        ...transformedStatements,
        ...functionRepository,
        generatedComponentConstructorCalls,
    ].filter((_) => !!_);

    return factory.updateSourceFile(sourceFile, allStatements);
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

    let calls = findMakeJayComponentConstructorCallsBlock(makeJayComponent_ImportName, sourceFile);
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sourceFile);
    let foundEventHandlers = constructorDefinitions.flatMap((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition),
    );

    let bindingResolver = new SourceFileBindingResolver(sourceFile);
    let analyzer = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns);

    let transformedEventHandlers = new TransformedEventHandlers(
        transformEventHandlers(context, bindingResolver, analyzer, factory, foundEventHandlers),
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
