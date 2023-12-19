import ts, {isIdentifier} from 'typescript';
import {mkTransformer, SourceFileTransformerContext} from './mk-transformer';
import {findMakeJayComponentImportTransformerBlock} from "./building-blocks/find-make-jay-component-import-transformer";
import {findComponentConstructors} from "./building-blocks/find-component-constructors.ts";
import {
    findComponentConstructorCalls,
    findComponentConstructorCallsBlock
} from "./building-blocks/find-component-constructor-calls.ts";

function mkComponentSecureFunctionsTransformer(
    sourceFileTransformerContext: SourceFileTransformerContext,
) {
    let makeJayComponentName = findMakeJayComponentImportTransformerBlock(sourceFileTransformerContext);
    if (Boolean(makeJayComponentName)) {
        let componentConstructorCalls = findComponentConstructorCallsBlock(makeJayComponentName, sourceFileTransformerContext);
        let componentFunctionExpressions = componentConstructorCalls
            .map(({comp}) => comp)


    }

    return sourceFileTransformerContext.sourceFile;
}

export function componentSecureFunctionsTransformer(): (
    context: ts.TransformationContext,
) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer);
}
