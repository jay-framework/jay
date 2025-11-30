import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import { SourceFileBindingResolver } from '@jay-framework/compiler';
import type { JayStackMethodCall } from './find-jay-stack-builder-calls';
import type { BuildEnvironment } from '../transform-jay-stack-builder';

const { isIdentifier } = tsBridge;

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
 * Analysis result for builder methods
 */
export interface BuilderMethodsAnalysis {
    /** Method calls that should be removed */
    methodsToRemove: JayStackMethodCall[];
    /** Variables used in removed methods (for statement removal) */
    removedVariables: Set<ReturnType<SourceFileBindingResolver['explain']>>;
}

/**
 * Analyze which builder methods should be removed for the target environment
 */
export function analyzeBuilderMethods(
    methodCalls: JayStackMethodCall[],
    environment: BuildEnvironment,
    bindingResolver: SourceFileBindingResolver,
): BuilderMethodsAnalysis {
    const methodsToRemove: JayStackMethodCall[] = [];
    const removedVariables = new Set<ReturnType<SourceFileBindingResolver['explain']>>();

    for (const method of methodCalls) {
        const shouldRemove =
            (environment === 'client' && SERVER_METHODS.has(method.methodName)) ||
            (environment === 'server' && CLIENT_METHODS.has(method.methodName));

        if (shouldRemove) {
            methodsToRemove.push(method);
            
            // Track all variables used in the arguments
            collectVariablesFromArguments(method.arguments, bindingResolver, removedVariables);
        }
    }

    return { methodsToRemove, removedVariables };
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

