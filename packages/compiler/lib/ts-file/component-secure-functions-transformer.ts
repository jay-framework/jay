import ts from 'typescript';
import {mkTransformer, SourceFileTransformerContext} from './mk-transformer';
import {findMakeJayComponentImportTransformerBlock} from "./building-blocks/find-make-jay-component-import-transformer";
import {findComponentConstructors} from "./building-blocks/find-component-constructors.ts";

function mkComponentSecureFunctionsTransformer(
    sourceFileTransformerContext: SourceFileTransformerContext,
) {
    let makeJayComponentName = findMakeJayComponentImportTransformerBlock(sourceFileTransformerContext);
    if (Boolean(makeJayComponentName)) {
       let components = findComponentConstructors(makeJayComponentName, sourceFileTransformerContext);
    }

    return sourceFileTransformerContext.sourceFile;
}

export function componentSecureFunctionsTransformer(): (
    context: ts.TransformationContext,
) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer);
}
