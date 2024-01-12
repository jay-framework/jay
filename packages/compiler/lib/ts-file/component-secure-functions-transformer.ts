import ts, { FunctionLikeDeclarationBase, isImportDeclaration } from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import { findMakeJayComponentImportTransformerBlock } from './building-blocks/find-make-jay-component-import';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors';
import { findComponentConstructorCallsBlock } from './building-blocks/find-component-constructor-calls';
import {
    findEventHandlersBlock,
    FoundEventHandlers,
} from './building-blocks/find-event-handler-functions';
import { compileFunctionSplitPatternsBlock } from './building-blocks/compile-function-split-patterns';
import { splitEventHandlerByPatternBlock } from './building-blocks/split-event-handler-by-pattern';
import { addEventHandlerCallBlock } from './building-blocks/add-event-handler-call$';
import { addImportModeFileExtension } from './building-blocks/add-import-mode-file-extension';
import { RuntimeMode } from '../core/runtime-mode';

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: string[];
};

function mkComponentSecureFunctionsTransformer(
    sftContext: ComponentSecureFunctionsTransformerConfig,
) {
    let { patterns, context, factory, sourceFile } = sftContext;

    // find the event handlers
    let makeJayComponent_ImportName = findMakeJayComponentImportTransformerBlock(sourceFile);
    if (!Boolean(makeJayComponent_ImportName)) return sourceFile;

    let calls = findComponentConstructorCallsBlock(makeJayComponent_ImportName, sourceFile);
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sourceFile);
    let foundEventHandlers = new FoundEventHandlers(
        constructorDefinitions.flatMap((constructorDefinition) =>
            findEventHandlersBlock(constructorDefinition),
        ),
    );

    // compile patterns
    // todo extract the pattern compilation to a prior stage
    let compiledPatterns = compileFunctionSplitPatternsBlock(patterns);

    let visitor = (node) => {
        if (foundEventHandlers.hasEventHandlerCallStatement(node)) {
            // the order of the statements here is important due to the immutable nature of the AST.
            // we first detect if this is an event handler call
            let foundEventHandler = foundEventHandlers.getFoundEventHandlerByCallStatement(node);
            // then transform any inline event handler
            node = ts.visitEachChild(node, visitor, context);
            // then, if the inline event handler was transformed, we add the handle$ call.
            if (foundEventHandler.eventHandlerMatchedPatterns)
                node = ts.visitEachChild(
                    node,
                    addEventHandlerCallBlock(context, factory, foundEventHandler),
                    context,
                );
            return node;
        }
        if (foundEventHandlers.hasEventHandler(node)) {
            return splitEventHandlerByPatternBlock(
                context,
                compiledPatterns.val,
                factory,
                foundEventHandlers.getFoundEventHandlersByHandler(node),
            )(node as FunctionLikeDeclarationBase);
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
