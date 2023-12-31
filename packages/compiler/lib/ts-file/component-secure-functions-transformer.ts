import ts, {isFunctionDeclaration} from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import { findMakeJayComponentImportTransformerBlock } from './building-blocks/find-make-jay-component-import';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors.ts';
import { findComponentConstructorCallsBlock } from './building-blocks/find-component-constructor-calls.ts';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions.ts';
import {NameBindingResolver} from "./building-blocks/name-binding-resolver.ts";
import {compileFunctionSplitPatternsBlock} from "./building-blocks/compile-function-split-patterns.ts";

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
    let eventHandlers = constructorDefinitions.map((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition, sftContext),
    );

    // compile patterns
    let {patterns, context} = sftContext;
    let compiledPatterns = compileFunctionSplitPatternsBlock(patterns);

    // todo start transforming the component definition functions

    return sftContext.sourceFile;
}

export function componentSecureFunctionsTransformer(
    patterns: string[],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer, { patterns });
}
