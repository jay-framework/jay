import ts from 'typescript';
import {mkTransformer, SourceFileTransformerContext} from './mk-transformer';
import {findMakeJayComponentImport} from "./building-blocks/find-make-jay-component-import";

function findComponents(makeJayComponentName: void) {}

function mkComponentSecureFunctionsTransformer(
    sourceFileTransformerData: SourceFileTransformerContext,
) {
    let makeJayComponentName = findMakeJayComponentImport(sourceFileTransformerData);
    console.log(makeJayComponentName);
    // let components = findComponents(makeJayComponentName);

    return sourceFileTransformerData.sourceFile;
}

export function componentSecureFunctionsTransformer(): (
    context: ts.TransformationContext,
) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkComponentSecureFunctionsTransformer);
}
