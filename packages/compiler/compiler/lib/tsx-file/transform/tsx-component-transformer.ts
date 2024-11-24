import ts from 'typescript';
import { JayTsxSourceFile } from '../../compiler-shared/source-file-type';
import { mkTransformer, SourceFileTransformerContext } from '../../ts-file/ts-utils/mk-transformer';

export function tsxComponentTransformer(
    jayTsxFile: JayTsxSourceFile,
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkSourceFileTransformer, { jayTsxFile });
}

function mkSourceFileTransformer({
    factory,
    sourceFile,
    context,
    jayTsxFile,
}: SourceFileTransformerContext & { jayTsxFile: JayTsxSourceFile }): ts.SourceFile {
    // TODO transform to component
    return sourceFile;
}
