import ts from "typescript";

const printer: ts.Printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
});
export function astToCode(node: ts.Node) {
    return printer.printNode(ts.EmitHint.Unspecified, node, undefined)
}


export function codeToAst(code: string, context: ts.TransformationContext): ts.Node[] {
    let dummySourceFile= ts.createSourceFile('dummy.ts',
        code ,
        ts.ScriptTarget.Latest, true);

    function visitor(node: ts.Node): ts.Node | ts.Node[] | undefined {
        let updatedNode = ts.setTextRange(node, {pos: -1, end: -1})
        return ts.visitEachChild(updatedNode, visitor, context);
    }

    return ts.visitEachChild(dummySourceFile, visitor, context).statements as any as ts.Node[];
}