import ts, { Statement, TransformationContext } from 'typescript';
import { getModeFileExtension, RuntimeMode } from '../core/runtime-mode';
import { astToCode, codeToAst } from './ts-utils/ts-compiler-utils';
import { mkTransformer, SourceFileTransformerContext } from './ts-utils/mk-transformer';
import { findMakeJayComponentImport } from './building-blocks/find-make-jay-component-import';
import { getImportName } from './ts-utils/extract-imports';
import { MAKE_JAY_COMPONENT } from '../core/constants';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions';
import { CompiledPattern } from './basic-analyzers/compile-function-split-patterns';
import {
    FunctionRepositoryFragment,
    // getAllFunctionRepositoryFragments,
    analyzeEventHandlers,
} from './building-blocks/analyze-event-handlers';
import { SourceFileBindingResolver } from './basic-analyzers/source-file-binding-resolver';
import {
    SourceFileStatementAnalyzer
} from './basic-analyzers/scoped-source-file-statement-analyzer';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
    FoundJayComponentConstructorCall,
} from './building-blocks/find-component-constructor-calls';
import {FunctionRepositoryBuilder} from "./building-blocks/function-repository-builder";

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

// function generateFunctionRepository(
//     functionRepositoryFragments: FunctionRepositoryFragment[],
//     context: TransformationContext,
// ): { hasFunctionRepository: boolean; functionRepository: Statement[] } {
//     if (functionRepositoryFragments.length > 0) {
//         let fragments = [...new Set(
//             functionRepositoryFragments
//                 .map((_) => `'${_.handlerIndex}': ${_.fragment.handlerCode}`))
//         ]
//             .join(',\n');
//
//         let constants = functionRepositoryFragments.map((_) => _.fragment.key);
//         let uniqueConstants = [...new Set(constants)];
//         let constantsCodeFragment =
//             uniqueConstants.length > 0 ? uniqueConstants.join('\n') + '\n\n' : '';
//
//         let functionRepository = `${constantsCodeFragment}const funcRepository: FunctionsRepository = {\n${fragments}\n};`;
//
//         return {
//             functionRepository: codeToAst(functionRepository, context) as Statement[],
//             hasFunctionRepository: true,
//         };
//     } else return { hasFunctionRepository: false, functionRepository: [] };
// }
//
function transformSourceFile(
    sourceFile: ts.SourceFile,
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    importerMode: RuntimeMode,
    componentConstructorCalls: FoundJayComponentConstructorCall[],
    componentFunctionRepository: FunctionRepositoryBuilder,
) {
    let { functionRepository, hasFunctionRepository } =
        componentFunctionRepository.generate(context)
    //     generateFunctionRepository(
    //     functionRepositoryFragments,
    //     context,
    // );

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

function mkComponentBridgeTransformer({
    factory,
    sourceFile,
    context,
    importerMode,
    patterns,
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

    let analyzer = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns);

    const componentFunctionRepository = new FunctionRepositoryBuilder();

    // const functionRepositoryFragments =
    //     getAllFunctionRepositoryFragments(
    analyzeEventHandlers(context, bindingResolver, analyzer, factory, foundEventHandlers, componentFunctionRepository)
// )

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
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentBridgeTransformer, { importerMode, patterns });
}
