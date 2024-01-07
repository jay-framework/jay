import ts, {
    FunctionLikeDeclarationBase
} from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import { findMakeJayComponentImportTransformerBlock } from './building-blocks/find-make-jay-component-import';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors.ts';
import { findComponentConstructorCallsBlock } from './building-blocks/find-component-constructor-calls.ts';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions.ts';
import {compileFunctionSplitPatternsBlock} from "./building-blocks/compile-function-split-patterns.ts";
import {splitEventHandlerByPatternBlock} from "./building-blocks/split-event-handler-by-pattern.ts";
import {addEventHandlerCallBlock} from "./building-blocks/add-event-handler-call$.ts";

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: string[];
};

function mkComponentSecureFunctionsTransformer(
    sftContext: ComponentSecureFunctionsTransformerConfig,
) {
    let {patterns, context, factory} = sftContext;

    // find the event handlers
    let makeJayComponent_ImportName = findMakeJayComponentImportTransformerBlock(sftContext);
    if (!Boolean(makeJayComponent_ImportName)) return sftContext.sourceFile;

    let calls = findComponentConstructorCallsBlock(makeJayComponent_ImportName, sftContext);
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sftContext);
    let foundEventHandlers = constructorDefinitions.flatMap((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition, sftContext));
    let handlers = new Set<ts.Node>(foundEventHandlers.map(_ => _.eventHandler));
    let eventHandlerCallStatements = new Set<ts.Node>(foundEventHandlers.map(_ => _.eventHandlerCallStatement));

    // compile patterns
    // todo extract the pattern compilation to a prior stage
    let compiledPatterns = compileFunctionSplitPatternsBlock(patterns);

    let visitor = (node) => {
        if (eventHandlerCallStatements.has(node))
            node = ts.visitEachChild(node, addEventHandlerCallBlock(context, factory), context)
        if (handlers.has(node))
            return splitEventHandlerByPatternBlock(context, compiledPatterns.val, factory)(node as FunctionLikeDeclarationBase)
        else
            return ts.visitEachChild(node, visitor, context);
    }
    return ts.visitEachChild(sftContext.sourceFile, visitor, context)
}

export function componentSecureFunctionsTransformer(
    patterns: string[],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer, { patterns });
}
