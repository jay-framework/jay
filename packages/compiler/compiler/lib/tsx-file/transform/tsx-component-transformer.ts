import { JayTsxSourceFile } from '../jsx-block';
import type * as ts from 'typescript';
import {
    mkTransformer,
    SourceFileTransformerContext,
} from '../../components-files/ts-utils/mk-transformer';

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
