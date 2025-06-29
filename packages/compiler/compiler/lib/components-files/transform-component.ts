import ts, { ImportDeclaration, isImportDeclaration } from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './ts-utils/mk-transformer';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions';
import { CompiledPattern } from './basic-analyzers/compile-function-split-patterns';
import { transformImportModeFileExtension } from './building-blocks/transform-import-mode-file-extension';
import { RuntimeMode } from '@jay-framework/compiler-shared';
import {
    analyzedEventHandlersToReplaceMap,
    analyzeEventHandlers,
} from './building-blocks/analyze-event-handlers';
import { transformComponentImports } from './building-blocks/transform-component-imports';
import { SourceFileBindingResolver } from './basic-analyzers/source-file-binding-resolver';
import { SourceFileStatementAnalyzer } from './basic-analyzers/scoped-source-file-statement-analyzer';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
} from './building-blocks/find-component-constructor-calls';
import {
    analyseGlobalExec$s,
    transformedGlobalExec$toReplaceMap,
} from './building-blocks/analyze-global-exec$';
import { findExec$ } from './building-blocks/find-exec$';
import { FunctionRepositoryBuilder } from './building-blocks/function-repository-builder';
import { filterEventHandlersToHaveJayEventType } from './building-blocks/filter-event-handlers-to-have-jay-event-type';

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: CompiledPattern[];
    globalFunctionRepository: FunctionRepositoryBuilder;
};

function isCssImport(node: ImportDeclaration) {
    return ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith('.css');
}

function mkComponentTransformer(sftContext: ComponentSecureFunctionsTransformerConfig) {
    const { patterns, globalFunctionRepository, context, factory, sourceFile } = sftContext;

    // find the event handlers
    const bindingResolver = new SourceFileBindingResolver(sourceFile);

    const calls = findComponentConstructorCallsBlock(
        FindComponentConstructorType.makeJayComponent,
        bindingResolver,
        sourceFile,
    );
    const constructorExpressions = calls.map(({ comp }) => comp);
    const constructorDefinitions = findComponentConstructorsBlock(
        constructorExpressions,
        sourceFile,
    );
    const foundEventHandlers = constructorDefinitions.flatMap((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition, bindingResolver),
    );
    const elementsEventHandlers = filterEventHandlersToHaveJayEventType(
        foundEventHandlers,
        bindingResolver,
    );

    const analyzer = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns);

    const componentFunctionRepository = new FunctionRepositoryBuilder();
    const transformedEventHandlers = analyzeEventHandlers(
        context,
        bindingResolver,
        analyzer,
        factory,
        elementsEventHandlers,
        componentFunctionRepository,
    );
    const eventsReplaceMap = analyzedEventHandlersToReplaceMap(transformedEventHandlers);

    const foundExec$ = findExec$(bindingResolver, sourceFile);
    const transformedGlobalExec$ = analyseGlobalExec$s(
        context,
        analyzer,
        globalFunctionRepository,
        foundExec$,
    );
    const globalExec$ReplaceMap = transformedGlobalExec$toReplaceMap(transformedGlobalExec$);

    const replaceMap = new Map([...eventsReplaceMap, ...globalExec$ReplaceMap]);

    let visitor = (node: ts.Node) => {
        if (replaceMap.has(node)) {
            node = replaceMap.get(node);
            return ts.visitEachChild(node, visitor, context);
        }
        if (isImportDeclaration(node)) {
            if (isCssImport(node)) return undefined;
            else return transformImportModeFileExtension(node, factory, RuntimeMode.WorkerSandbox);
        }
        return ts.visitEachChild(node, visitor, context);
    };
    let transformedSourceFile = ts.visitEachChild(sftContext.sourceFile, visitor, context);

    return transformComponentImports(
        transformedEventHandlers.length > 0,
        false,
        transformedGlobalExec$.length > 0,
        transformedSourceFile,
        context,
        factory,
        sourceFile,
    );
}

export function transformComponent(
    patterns: CompiledPattern[] = [],
    globalFunctionRepository: FunctionRepositoryBuilder,
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentTransformer, { patterns, globalFunctionRepository });
}
