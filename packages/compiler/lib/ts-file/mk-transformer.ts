import ts, {TransformerFactory} from "typescript";

export type Visitor = (node: ts.Node) =>
    ts.Node | ts.Node[] | undefined;

export type TransformationVisitor<Config> = (factory: ts.NodeFactory, context: ts.TransformationContext, config: Config) =>
    Visitor;

export function mkTransformer<Config>(
    config: Config,
    visitor: TransformationVisitor<Config>
): TransformerFactory<ts.SourceFile> {
    return (context: ts.TransformationContext) => {
        const {factory} = context;
        return (sourceFile) => {
            return ts.visitEachChild(sourceFile, visitor(factory, context, config), context);
        };
    };
}