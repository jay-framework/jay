import ts from 'typescript';
import {SourceFileBindingResolver} from "../basic-analyzers/source-file-binding-resolver";
import {flattenVariable, isImportModuleVariableRoot} from "../basic-analyzers/name-binding-resolver";

export function findExec$(bindingResolver: SourceFileBindingResolver, sourceFile: ts.SourceFile) {
    const foundExec$: ts.CallExpression[] = [];

    function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            const functionVariable = bindingResolver.explain(node.expression)
            const accessChain = flattenVariable(functionVariable);
            if (accessChain.path.length === 1 &&
                accessChain.path[0] === 'exec$' &&
                isImportModuleVariableRoot(accessChain.root) &&
                ts.isStringLiteral(accessChain.root.module) &&
                accessChain.root.module.text === 'jay-secure')
            foundExec$.push(node);
        }
        ts.forEachChild(node, visit);
    }

    ts.forEachChild(sourceFile, visit);
    return foundExec$;
}