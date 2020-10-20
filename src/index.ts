console.log('hi')


import ts, {SyntaxKind} from 'typescript';
import fs from 'fs';

const path = './examples/basic/input.tsx';
const node = ts.createSourceFile(
    path,
    <string>fs.readFileSync(path, 'utf8'), // sourceText
    ts.ScriptTarget.Latest // langugeVersion
);

function printAllChildren(node: ts.Node, depth = 0) {
    console.log(new Array(depth+1).join('----'), SyntaxKind[node.kind], node.pos, node.end);
    depth++;
    node.forEachChild(c=> printAllChildren(c, depth));
}

printAllChildren(node)
