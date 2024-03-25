import ts, {
    isCallExpression,
    isIdentifier,
    isPropertyAccessExpression,
    isStringLiteral,
    isVariableStatement,
} from 'typescript';
import { SourceFileBindingResolver } from './source-file-binding-resolver';
import { flattenVariable, isImportModuleVariableRoot } from './name-binding-resolver';

export enum FindComponentConstructorType {
    makeJayComponent = 'makeJayComponent',
    makeJayTsxComponent = 'makeJayTsxComponent',
}

export interface FoundJayComponentConstructorCall {
    type: FindComponentConstructorType;
    render?: ts.Expression;
    comp: ts.Expression;
    name: ts.BindingName;
}

export function findComponentConstructorCalls(
    findType: FindComponentConstructorType,
    bindingResolver: SourceFileBindingResolver,
    node: ts.Node,
): FoundJayComponentConstructorCall[] {
    const foundConstructorCalls: FoundJayComponentConstructorCall[] = [];
    if (isVariableStatement(node)) {
        node.declarationList.declarations.forEach((declaration) => {
            if (
                declaration.initializer &&
                isCallExpression(declaration.initializer) &&
                (isIdentifier(declaration.initializer.expression) ||
                    isPropertyAccessExpression(declaration.initializer.expression))
            ) {
                const explainedInitializer = bindingResolver.explain(
                    declaration.initializer.expression,
                );
                const flattened = flattenVariable(explainedInitializer);
                if (
                    flattened.path.length === 1 &&
                    flattened.path[0] === findType &&
                    flattened.root &&
                    isImportModuleVariableRoot(flattened.root) &&
                    isStringLiteral(flattened.root.module) &&
                    flattened.root.module.text === 'jay-component'
                ) {
                    let render =
                        findType === FindComponentConstructorType.makeJayComponent
                            ? declaration.initializer.arguments[0]
                            : undefined;
                    let comp =
                        findType === FindComponentConstructorType.makeJayComponent
                            ? declaration.initializer.arguments[1]
                            : declaration.initializer.arguments[0];
                    let foundConstructor: FoundJayComponentConstructorCall = {
                        type: findType,
                        name: declaration.name,
                        render,
                        comp,
                    };
                    foundConstructorCalls.push(foundConstructor);
                }
            }
        });
    }
    return foundConstructorCalls;
}

export function findComponentConstructorCallsBlock(
    findType: FindComponentConstructorType,
    bindingResolver: SourceFileBindingResolver,
    sourceFile: ts.SourceFile,
): FoundJayComponentConstructorCall[] {
    const foundConstructorCalls: FoundJayComponentConstructorCall[] = [];

    function visit(node): void {
        foundConstructorCalls.push(
            ...findComponentConstructorCalls(findType, bindingResolver, node),
        );
        ts.forEachChild(node, visit);
    }

    ts.forEachChild(sourceFile, visit);
    return foundConstructorCalls;
}
