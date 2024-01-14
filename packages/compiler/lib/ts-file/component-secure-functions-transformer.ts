import ts, { isImportDeclaration } from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import { findMakeJayComponentImportTransformerBlock } from './building-blocks/find-make-jay-component-import';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors';
import { findComponentConstructorCallsBlock } from './building-blocks/find-component-constructor-calls';
import {
    findEventHandlersBlock,
} from './building-blocks/find-event-handler-functions';
import { compileFunctionSplitPatternsBlock } from './building-blocks/compile-function-split-patterns';
import { addImportModeFileExtension } from './building-blocks/add-import-mode-file-extension';
import { RuntimeMode } from '../core/runtime-mode';
import { MAKE_JAY_COMPONENT } from '../core/constants';
import {TransformedEventHandlers, transformEventHandlers} from "./building-blocks/transform-event-handlers";

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: string[];
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
    let foundEventHandlers =
        constructorDefinitions.flatMap((constructorDefinition) =>
            findEventHandlersBlock(constructorDefinition),
        );

    // compile patterns
    // todo extract the pattern compilation to a prior stage
    let compiledPatterns = compileFunctionSplitPatternsBlock(patterns);

    let transformedEventHandlers = new TransformedEventHandlers(
        transformEventHandlers(context, compiledPatterns.val, factory, foundEventHandlers));

    let visitor = (node) => {
        if (transformedEventHandlers.hasEventHandlerCallStatement(node)) {
            let transformedEventHandler = transformedEventHandlers.getTransformedEventHandlerCallStatement(node);
            node = transformedEventHandler.transformedEventHandlerCallStatement
            return ts.visitEachChild(node, visitor, context);
        }
        if (transformedEventHandlers.hasEventHandler(node)) {
            let transformedEventHandler = transformedEventHandlers.getTransformedEventHandler(node)
            node = transformedEventHandler[0].transformedEventHandler
            return ts.visitEachChild(node, visitor, context);
        }
        if (isImportDeclaration(node))
            return addImportModeFileExtension(node, factory, RuntimeMode.WorkerSandbox);
        return ts.visitEachChild(node, visitor, context);
    };
    return ts.visitEachChild(sftContext.sourceFile, visitor, context);
}

export function componentSecureFunctionsTransformer(
    patterns: string[] = [],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer, { patterns });
}
