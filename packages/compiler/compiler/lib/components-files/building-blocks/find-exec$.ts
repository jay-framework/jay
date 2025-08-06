import { SourceFileBindingResolver } from '../basic-analyzers/source-file-binding-resolver';
import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const { isCallExpression, isIdentifier, isStringLiteral, forEachChild } = tsBridge;
import {
    flattenVariable,
    isImportModuleVariableRoot,
} from '../basic-analyzers/name-binding-resolver';

export function findExec$(bindingResolver: SourceFileBindingResolver, sourceFile: ts.SourceFile) {
    const foundExec$: ts.CallExpression[] = [];

    function visit(node: ts.Node) {
        if (isCallExpression(node) && isIdentifier(node.expression)) {
            const functionVariable = bindingResolver.explain(node.expression);
            const accessChain = flattenVariable(functionVariable);
            if (
                accessChain.path.length === 1 &&
                accessChain.path[0] === 'exec$' &&
                isImportModuleVariableRoot(accessChain.root) &&
                isStringLiteral(accessChain.root.module) &&
                accessChain.root.module.text === '@jay-framework/secure'
            )
                foundExec$.push(node);
        }
        forEachChild(node, visit);
    }

    forEachChild(sourceFile, visit);
    return foundExec$;
}
