import ts, { isImportDeclaration } from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './ts-utils/mk-transformer';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions';
import { CompiledPattern } from './building-blocks/compile-function-split-patterns';
import { transformImportModeFileExtension } from './building-blocks/transform-import-mode-file-extension';
import { RuntimeMode } from '../core/runtime-mode';
import {
    TransformedEventHandlers,
    transformEventHandlers,
} from './building-blocks/transform-event-handlers';
import { findAfterImportStatementIndex } from './building-blocks/find-after-import-statement-index';
import { codeToAst } from './ts-utils/ts-compiler-utils';
import { SourceFileBindingResolver } from './building-blocks/source-file-binding-resolver';
import {
    ScopedSourceFileStatementAnalyzer,
    SourceFileStatementAnalyzer
} from './building-blocks/scoped-source-file-statement-analyzer';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
} from './building-blocks/find-component-constructor-calls';

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: CompiledPattern[];
};

function isCssImport(node) {
    return ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith('.css');
}

function mkComponentTransformer(sftContext: ComponentSecureFunctionsTransformerConfig) {
    let { patterns, context, factory, sourceFile } = sftContext;

    // find the event handlers
    let bindingResolver = new SourceFileBindingResolver(sourceFile);

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

    let transformedEventHandlers = new TransformedEventHandlers(
        transformEventHandlers(context, bindingResolver, analyzer, factory, foundEventHandlers),
    );

    let visitor = (node) => {
        if (transformedEventHandlers.hasEventHandlerCallStatement(node)) {
            let transformedEventHandler =
                transformedEventHandlers.getTransformedEventHandlerCallStatement(node);
            node = transformedEventHandler.transformedEventHandlerCallStatement;
            return ts.visitEachChild(node, visitor, context);
        }
        if (transformedEventHandlers.hasEventHandler(node)) {
            let transformedEventHandler = transformedEventHandlers.getTransformedEventHandler(node);
            node = transformedEventHandler[0].transformedEventHandler;
            return ts.visitEachChild(node, visitor, context);
        }
        if (isImportDeclaration(node)) {
            if (isCssImport(node)) return undefined;
            else return transformImportModeFileExtension(node, factory, RuntimeMode.WorkerSandbox);
        }
        return ts.visitEachChild(node, visitor, context);
    };
    let transformedSourceFile = ts.visitEachChild(sftContext.sourceFile, visitor, context);

    if (transformedEventHandlers.includesTransformedEventHandlers()) {
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
