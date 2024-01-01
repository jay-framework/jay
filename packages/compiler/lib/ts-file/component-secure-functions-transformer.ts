import ts, {
    isBlock,
    isCallExpression,
    isExpression,
    isFunctionDeclaration,
    isPropertyAccessExpression
} from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import { findMakeJayComponentImportTransformerBlock } from './building-blocks/find-make-jay-component-import';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors.ts';
import { findComponentConstructorCallsBlock } from './building-blocks/find-component-constructor-calls.ts';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions.ts';
import {compileFunctionSplitPatternsBlock} from "./building-blocks/compile-function-split-patterns.ts";
import {splitEventHandlerByPatternBlock} from "./building-blocks/split-event-handler-by-pattern.ts";

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: string[];
};

function mkComponentSecureFunctionsTransformer(
    sftContext: ComponentSecureFunctionsTransformerConfig,
) {
    // find the event handlers
    let makeJayComponent_ImportName = findMakeJayComponentImportTransformerBlock(sftContext);
    if (!Boolean(makeJayComponent_ImportName)) return sftContext.sourceFile;

    let calls = findComponentConstructorCallsBlock(makeJayComponent_ImportName, sftContext);
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sftContext);
    let eventHandlers = constructorDefinitions.flatMap((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition, sftContext),
    );

    // compile patterns
    let {patterns, context} = sftContext;
    let compiledPatterns = compileFunctionSplitPatternsBlock(patterns);
    // todo validate we have valid compile patterns
    // todo extract the pattern compilation to a prior stage

    eventHandlers.forEach(eventHandler => {
        // todo change to ts.visitEachChild structure
        splitEventHandlerByPatternBlock(context, compiledPatterns.val)(eventHandler)
    });


    return sftContext.sourceFile;
}

export function componentSecureFunctionsTransformer(
    patterns: string[],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer, { patterns });
}
