import ts from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import { findMakeJayComponentImportTransformerBlock } from './building-blocks/find-make-jay-component-import';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors.ts';
import { findComponentConstructorCallsBlock } from './building-blocks/find-component-constructor-calls.ts';
import { findEventHandlersBlock } from './building-blocks/find-event-handler-functions.ts';

type ComponentSecureFunctionsTransformerConfig = SourceFileTransformerContext & {
    patterns: string[];
};

function parsePatterns(patterns: string[]) {
    patterns.forEach((pattern) => {
        let patternSourceFile = ts.createSourceFile(
            'dummy.ts',
            pattern,
            ts.ScriptTarget.Latest,
            false,
            ts.ScriptKind.TS,
        );
        // find imports
        // find functions
        // for each function statement, consider as a pattern.
        // only support call statements or return statements
        // validate only usage of function parameters, single statement functions, no conditions.
    });
}

function mkComponentSecureFunctionsTransformer(
    sftContext: ComponentSecureFunctionsTransformerConfig,
) {
    let makeJayComponent_ImportName = findMakeJayComponentImportTransformerBlock(sftContext);
    if (!Boolean(makeJayComponent_ImportName)) return sftContext.sourceFile;

    let calls = findComponentConstructorCallsBlock(makeJayComponent_ImportName, sftContext);
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sftContext);
    let eventHandlers = constructorDefinitions.map((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition, sftContext),
    );

    // todo start transforming the component definition functions

    return sftContext.sourceFile;
}

export function componentSecureFunctionsTransformer(
    patterns: string[],
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer, { patterns });
}
