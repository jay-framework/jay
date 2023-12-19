import ts from 'typescript';
import {mkTransformer, SourceFileTransformerContext} from './mk-transformer';
import {findMakeJayComponentImportTransformerBlock} from "./building-blocks/find-make-jay-component-import-transformer";
import {findComponentConstructorsBlock} from "./building-blocks/find-component-constructors.ts";
import {
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
        let componentConstructorFunctions = findComponentConstructorsBlock(componentFunctionExpressions, sourceFileTransformerContext);
        // todo start transforming the component definition functions
    }

    return sourceFileTransformerContext.sourceFile;
}

export function componentSecureFunctionsTransformer(): (
    context: ts.TransformationContext,
) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer);
}
