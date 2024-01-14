import ts, { isImportDeclaration } from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import { findMakeJayComponentImportTransformerBlock } from './building-blocks/find-make-jay-component-import';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors';
import { findComponentConstructorCallsBlock } from './building-blocks/find-component-constructor-calls';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions';
import { CompiledPattern } from './building-blocks/compile-function-split-patterns';
import { transformImportModeFileExtension } from './building-blocks/transform-import-mode-file-extension';
import { RuntimeMode } from '../core/runtime-mode';
import { MAKE_JAY_COMPONENT } from '../core/constants';
import {
    TransformedEventHandlers,
    transformEventHandlers,
} from './building-blocks/transform-event-handlers';
import { findAfterImportStatementIndex } from './building-blocks/find-after-import-statement-index.ts';
import { codeToAst } from './ts-compiler-utils.ts';

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: CompiledPattern[];
};

function mkComponentSecureFunctionsTransformer(
    sftContext: ComponentSecureFunctionsTransformerConfig,
) {
    let { patterns, context, factory, sourceFile } = sftContext;

    // find the event handlers
    let makeJayComponent_ImportName = findMakeJayComponentImportTransformerBlock(
        MAKE_JAY_COMPONENT,
        sourceFile,
    );
    if (!Boolean(makeJayComponent_ImportName)) return sourceFile;

    let calls = findComponentConstructorCallsBlock(makeJayComponent_ImportName, sourceFile);
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sourceFile);
    let foundEventHandlers = constructorDefinitions.flatMap((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition),
    );

    let transformedEventHandlers = new TransformedEventHandlers(
        transformEventHandlers(context, patterns, factory, foundEventHandlers),
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
        if (isImportDeclaration(node))
            return transformImportModeFileExtension(node, factory, RuntimeMode.WorkerSandbox);
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

export function componentSecureFunctionsTransformer(
    patterns: CompiledPattern[] = [],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer, { patterns });
}
