import ts from 'typescript';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import { findMakeJayComponentImportTransformerBlock } from './building-blocks/find-make-jay-component-import-transformer';
import { findComponentConstructorsBlock } from './building-blocks/find-component-constructors.ts';
import { findComponentConstructorCallsBlock } from './building-blocks/find-component-constructor-calls.ts';

function mkComponentSecureFunctionsTransformer(
    sftContext: SourceFileTransformerContext,
) {
    let makeJayComponent_ImportName = findMakeJayComponentImportTransformerBlock(
        sftContext,
    );
    if (!Boolean(makeJayComponent_ImportName))
        return sftContext.sourceFile;

    let calls = findComponentConstructorCallsBlock(
        makeJayComponent_ImportName,
        sftContext,
    );
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(
        constructorExpressions,
        sftContext,
    );
    // todo start transforming the component definition functions

    return sftContext.sourceFile;
}

export function componentSecureFunctionsTransformer(): (
    context: ts.TransformationContext,
) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer);
}
