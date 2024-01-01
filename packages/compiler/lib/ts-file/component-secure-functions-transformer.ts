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
import {flattenVariable, NameBindingResolver} from "./building-blocks/name-binding-resolver.ts";
import {compileFunctionSplitPatternsBlock} from "./building-blocks/compile-function-split-patterns.ts";

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: string[];
};

const transformEventHandlerStatement: (nameBindingResolver: NameBindingResolver) => ts.Visitor =
    (nameBindingResolver: NameBindingResolver) => (node) => {
    if (isCallExpression(node)) {
        node.arguments.forEach(argument => {
            if (isPropertyAccessExpression(argument)) {
                let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(argument);
                console.log(flattenVariable(resolvedParam));
            }
        })

    }
    return node;
}

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

    eventHandlers.forEach(eventHandler => {
        let nameBindingResolver = new NameBindingResolver();
        nameBindingResolver.addFunctionParams(eventHandler);

        ts.visitEachChild(eventHandler, transformEventHandlerStatement(nameBindingResolver), context)

    });

    // todo start transforming the component definition functions

    return sftContext.sourceFile;
}

export function componentSecureFunctionsTransformer(
    patterns: string[],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer, { patterns });
}
