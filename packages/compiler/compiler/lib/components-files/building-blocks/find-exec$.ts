import { SourceFileBindingResolver } from '../basic-analyzers/source-file-binding-resolver';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { forEachChild, isCallExpression, isIdentifier, isStringLiteral } = tsModule;
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
