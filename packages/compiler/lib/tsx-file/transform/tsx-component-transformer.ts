import ts from 'typescript';
import { JayTsxFile } from '../../core/jay-file';
import { mkTransformer, SourceFileTransformerContext } from '../../ts-file/ts-utils/mk-transformer';

export function tsxComponentTransformer(
    jayTsxFile: JayTsxFile,
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkSourceFileTransformer, { jayTsxFile });
}

function mkSourceFileTransformer({
    factory,
    sourceFile,
    context,
    jayTsxFile,
}: SourceFileTransformerContext & { jayTsxFile: JayTsxFile }): ts.SourceFile {
    // TODO transform to component
    return sourceFile;
}
