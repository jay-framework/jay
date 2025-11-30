import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import { SourceFileBindingResolver } from '@jay-framework/compiler';
import type { BuildEnvironment } from '../transform-jay-stack-builder';

const { isCallExpression, isPropertyAccessExpression, isIdentifier, isStringLiteral } = tsBridge;

const SERVER_METHODS = new Set([
    'withServices',
    'withLoadParams',
    'withSlowlyRender',
    'withFastRender',
]);

const CLIENT_METHODS = new Set([
    'withInteractive',
    'withContexts',
]);

/**
 * Analysis result for methods to remove
 */
export interface BuilderMethodsToRemove {
    /** Set of call expressions to remove */
    callsToRemove: Set<ts.CallExpression>;
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
    const callsToRemove = new Set<ts.CallExpression>();
    const removedVariables = new Set<ReturnType<SourceFileBindingResolver['explain']>>();

    const visit = (node: ts.Node) => {
        // Check if this is a builder method call that should be removed
        if (isCallExpression(node) && isPropertyAccessExpression(node.expression)) {
            const methodName = node.expression.name.text;
            
            // Check if this method should be removed for this environment
            const shouldRemove =
                (environment === 'client' && SERVER_METHODS.has(methodName)) ||
                (environment === 'server' && CLIENT_METHODS.has(methodName));

            if (shouldRemove) {
                // Verify this is part of a makeJayStackComponent chain
                // TODO: Re-enable validation once basic transformation works
                // if (isPartOfJayStackChain(node, bindingResolver)) {
                    callsToRemove.add(node);
                    
                    // Collect variables from arguments
                    collectVariablesFromArguments(node.arguments, bindingResolver, removedVariables);
                // }
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
                
                // Check if it's imported from the correct module
                if (variable?.root && 'module' in variable.root) {
                    const importRoot = variable.root as any;
                    const moduleSpecifier = importRoot.module;
                    
                    if (
                        isStringLiteral(moduleSpecifier) &&
                        moduleSpecifier.text === '@jay-framework/fullstack-component' &&
                        variable.name === 'makeJayStackComponent'
                    ) {
                        return true;
                    }
                }
            }
            
            // Continue down the chain if this call has a property access
            if (isPropertyAccessExpression(current.expression)) {
                current = current.expression.expression;
                continue; // Keep searching down the chain
            } else {
                // This call doesn't have a property access, break
                break;
            }
        } else {
            // Not a property access or call expression, we've reached the end
            break;
        }
    }

    // Didn't find makeJayStackComponent
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

