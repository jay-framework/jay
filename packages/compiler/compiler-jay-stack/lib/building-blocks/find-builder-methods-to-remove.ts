import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import {
    flattenVariable,
    SourceFileBindingResolver,
    FlattenedAccessChain,
    VariableRootType, isImportModuleVariableRoot, Variable
} from '@jay-framework/compiler';
import type { BuildEnvironment } from '../transform-jay-stack-builder';
import { shouldRemoveMethod } from './check-method-should-remove';

const { isCallExpression, isPropertyAccessExpression, isIdentifier, isStringLiteral } = tsBridge;

/**
 * Analysis result for methods to remove
 */
export interface BuilderMethodsToRemove {
    /** Set of call expressions to remove */
    callsToRemove: Array<FlattenedAccessChain>;
    /** Variables used in removed methods */
    removedVariables: Set<ReturnType<SourceFileBindingResolver['explain']>>;
}

/**
 * Find all builder method calls that should be removed for the target environment
 * This traverses the entire AST and checks if each call expression is part of a
 * makeJayStackComponent chain and should be removed based on the environment.
 */
export function findBuilderMethodsToRemove(
    sourceFile: ts.SourceFile,
    bindingResolver: SourceFileBindingResolver,
    environment: BuildEnvironment,
): BuilderMethodsToRemove {
    const callsToRemove: Array<FlattenedAccessChain> = [];
    const removedVariables = new Set<ReturnType<SourceFileBindingResolver['explain']>>();

    const visit = (node: ts.Node) => {
        if (isCallExpression(node) &&
            isPropertyAccessExpression(node.expression) &&
            isPartOfJayStackChain(node, bindingResolver)) {
            const methodName = node.expression.name.text;

            if (shouldRemoveMethod(methodName, environment)) {
                const variable = bindingResolver.explain(node.expression);
                const flattened = flattenVariable(variable);
                callsToRemove.push(flattened);
                // Collect variables from arguments
                collectVariablesFromArguments(node.arguments, bindingResolver, removedVariables);
            }
        }

        node.forEachChild(visit);
    };

    sourceFile.forEachChild(visit);
    return { callsToRemove, removedVariables };
}

/**
 * Check if a call expression is part of a makeJayStackComponent builder chain
 * Walks up the chain to find if it eventually calls makeJayStackComponent
 */
function isPartOfJayStackChain(
    callExpr: ts.CallExpression,
    bindingResolver: SourceFileBindingResolver,
): boolean {
    let current: ts.Expression = callExpr.expression;

    // Walk down the left side of the chain
    while (true) {
        if (isPropertyAccessExpression(current)) {
            // Keep going down the chain
            current = current.expression;
        } else if (isCallExpression(current)) {
            // Check if this is the makeJayStackComponent() call
            if (isIdentifier(current.expression)) {
                const variable = bindingResolver.explain(current.expression);
                const flattened: FlattenedAccessChain = flattenVariable(variable);
                if (flattened.path.length === 1 &&
                    flattened.path[0] === 'makeJayStackComponent' &&
                    isImportModuleVariableRoot(flattened.root) &&
                    isStringLiteral(flattened.root.module) &&
                    flattened.root.module.text === '@jay-framework/fullstack-component')
                    return true;
            }
            
            // Continue down the chain if this call has a property access
            if (isPropertyAccessExpression(current.expression)) {
                current = current.expression.expression;
                continue; // Keep searching down the chain
            } else {
                // This call doesn't have a property access, reached the end
                break;
            }
        } else {
            // Not a property access or call expression
            break;
        }
    }

    return false;
}

/**
 * Collect all variables referenced in method arguments
 */
function collectVariablesFromArguments(
    args: ts.NodeArray<ts.Expression>,
    bindingResolver: SourceFileBindingResolver,
    variables: Set<ReturnType<SourceFileBindingResolver['explain']>>,
) {
    const visitor = (node: ts.Node) => {
        if (isIdentifier(node)) {
            const variable = bindingResolver.explain(node);
            // Only track variables that were successfully resolved
            if (variable && (variable.name || variable.root)) {
                variables.add(variable);
            }
        }
        node.forEachChild(visitor);
    };

    args.forEach(arg => visitor(arg));
}

