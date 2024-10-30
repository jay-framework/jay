import ts, { isImportDeclaration } from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './ts-utils/mk-transformer';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions';
import { CompiledPattern } from './basic-analyzers/compile-function-split-patterns';
import { transformImportModeFileExtension } from './building-blocks/transform-import-mode-file-extension';
import { RuntimeMode } from '../core/runtime-mode';
import {
    analyzedEventHandlersToReplaceMap,
    analyzeEventHandlers,
} from './building-blocks/analyze-event-handlers';
import { findAfterImportStatementIndex } from './building-blocks/find-after-import-statement-index';
import { codeToAst } from './ts-utils/ts-compiler-utils';
import { SourceFileBindingResolver } from './basic-analyzers/source-file-binding-resolver';
import {
    SourceFileStatementAnalyzer
} from './basic-analyzers/scoped-source-file-statement-analyzer';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
} from './building-blocks/find-component-constructor-calls';
import {analyseGlobalExec$s, transformedGlobalExec$toReplaceMap} from "./building-blocks/analyze-global-exec$";
import {findExec$} from "./building-blocks/find-exec$";
import {FunctionRepositoryBuilder} from "./building-blocks/function-repository-builder";

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: CompiledPattern[];
};

function isCssImport(node) {
    return ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith('.css');
}

function mkComponentTransformer(sftContext: ComponentSecureFunctionsTransformerConfig) {
    const { patterns, context, factory, sourceFile } = sftContext;

    // find the event handlers
    const bindingResolver = new SourceFileBindingResolver(sourceFile);

    const calls = findComponentConstructorCallsBlock(
        FindComponentConstructorType.makeJayComponent,
        bindingResolver,
        sourceFile,
    );
    const constructorExpressions = calls.map(({ comp }) => comp);
    const constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sourceFile);
    const foundEventHandlers = constructorDefinitions.flatMap((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition, bindingResolver),
    );

    const analyzer = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, patterns);

    const transformedEventHandlers1 = analyzeEventHandlers(context, bindingResolver, analyzer, factory, foundEventHandlers);

    const eventsReplaceMap = analyzedEventHandlersToReplaceMap(transformedEventHandlers1);

    const globalExec$FunctionRepositoryBuilder = new FunctionRepositoryBuilder();
    const foundExec$ = findExec$(bindingResolver, sourceFile);
    const transformedGlobalExec$ = analyseGlobalExec$s(context, analyzer, globalExec$FunctionRepositoryBuilder, foundExec$)
    const globalExec$ReplaceMap = transformedGlobalExec$toReplaceMap(transformedGlobalExec$)

    const replaceMap = new Map([...eventsReplaceMap, ...globalExec$ReplaceMap]);

    let visitor = (node) => {
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

    if (transformedEventHandlers1.length > 0) {
        let statements = [...transformedSourceFile.statements];
        let afterImportStatementIndex = findAfterImportStatementIndex(statements);

        let allStatements = [
            ...statements.slice(0, afterImportStatementIndex),
            codeToAst(`import { handler$ } from 'jay-secure';`, context)[0] as ts.Statement,
            ...statements.slice(afterImportStatementIndex),
        ];
        return factory.updateSourceFile(sourceFile, allStatements);
    } else return transformedSourceFile;
}

export function transformComponent(
    patterns: CompiledPattern[] = [],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentTransformer, { patterns });
}
