import ts, { TransformerFactory } from 'typescript';

export type SourceFileTransformer<Config> = (
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    config: Config,
    node: ts.SourceFile,
) => ts.SourceFile;

export function mkTransformer<Config>(
    config: Config,
    fileTransformer: SourceFileTransformer<Config>,
): TransformerFactory<ts.SourceFile> {
    return (context: ts.TransformationContext) => {
        const { factory } = context;
        return (sourceFile) => {
            return fileTransformer(factory, context, config, sourceFile);
        };
    };
}
