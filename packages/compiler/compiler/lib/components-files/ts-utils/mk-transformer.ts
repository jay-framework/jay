import type * as ts from 'typescript';

export interface SourceFileTransformerContext {
    factory: ts.NodeFactory;
    context: ts.TransformationContext;
    sourceFile: ts.SourceFile;
}

export type SourceFileTransformer<S extends SourceFileTransformerContext> = (
    data: SourceFileTransformerContext,
) => ts.SourceFile;

export function mkTransformer<C extends object>(
    fileTransformer: SourceFileTransformer<C & SourceFileTransformerContext>,
    config?: C,
): ts.TransformerFactory<ts.SourceFile> {
    return (context: ts.TransformationContext) => {
        const { factory } = context;
        return (sourceFile) => {
            return fileTransformer({ factory, context, sourceFile, ...(config || {}) });
        };
    };
}
