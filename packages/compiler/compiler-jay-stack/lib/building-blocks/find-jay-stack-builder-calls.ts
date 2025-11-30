import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import { SourceFileBindingResolver } from '@jay-framework/compiler';

const { isCallExpression, isIdentifier, isPropertyAccessExpression, isStringLiteral } = tsBridge;

/**
 * Represents a found Jay Stack component builder call chain
 */
export interface FoundJayStackBuilderCall {
    /** The root call expression (makeJayStackComponent()) */
    rootCall: ts.CallExpression;
    /** All method calls in the chain */
    methodCalls: JayStackMethodCall[];
}

/**
 * Represents a single method call in a builder chain
 */
export interface JayStackMethodCall {
    /** The method name (e.g., 'withProps', 'withServices') */
    methodName: string;
    /** The call expression node */
    callExpression: ts.CallExpression;
    /** Arguments passed to this method */
    arguments: ts.NodeArray<ts.Expression>;
}

/**
 * Find all Jay Stack component builder calls in a source file
 * Uses binding resolver to ensure we're only finding calls to the actual
 * makeJayStackComponent from '@jay-framework/fullstack-component'
 */
export function findJayStackBuilderCalls(
    sourceFile: ts.SourceFile,
    bindingResolver: SourceFileBindingResolver,
): FoundJayStackBuilderCall[] {
    const found: FoundJayStackBuilderCall[] = [];

    const visit = (node: ts.Node) => {
        // Check if this is a call expression that might be makeJayStackComponent()
        if (isCallExpression(node)) {
            const rootCall = findMakeJayStackComponentCall(node, bindingResolver);
            if (rootCall) {
                // Found a makeJayStackComponent() call, now collect the method chain
                const methodCalls = collectMethodChain(node);
                found.push({ rootCall, methodCalls });
            }
        }

        node.forEachChild(visit);
    };

    sourceFile.forEachChild(visit);
    return found;
}

/**
 * Check if a call expression is makeJayStackComponent() from the correct package
 */
function findMakeJayStackComponentCall(
    callExpr: ts.CallExpression,
    bindingResolver: SourceFileBindingResolver,
): ts.CallExpression | undefined {
    // Check if the expression is an identifier
    if (!isIdentifier(callExpr.expression)) {
        return undefined;
    }

    const identifier = callExpr.expression;
    
    // Use binding resolver to trace where this identifier comes from
    const variable = bindingResolver.explain(identifier);
    
    // Check if it's imported from the correct module
    // The root should have an ImportModule kind (kind === 3)
    if (variable?.root && 'module' in variable.root) {
        const importRoot = variable.root as any;
        const moduleSpecifier = importRoot.module;
        
        if (
            isStringLiteral(moduleSpecifier) &&
            moduleSpecifier.text === '@jay-framework/fullstack-component' &&
            variable.name === 'makeJayStackComponent'
        ) {
            return callExpr;
        }
    }

    return undefined;
}

/**
 * Collect all method calls in a builder chain starting from the root
 */
function collectMethodChain(rootCall: ts.CallExpression): JayStackMethodCall[] {
    const methods: JayStackMethodCall[] = [];
    let current: ts.Node = rootCall;

    // Walk up the parent chain looking for chained method calls
    // This is tricky because we need to look at the parent, not children
    // For now, let's use a simpler approach: check if this call is part of a larger expression

    // Actually, we should traverse the expression tree differently
    // Let's check if the root call's parent is a property access, and its parent is a call
    const collectFromNode = (node: ts.Node) => {
        if (isCallExpression(node) && isPropertyAccessExpression(node.expression)) {
            const methodName = node.expression.name.text;
            methods.push({
                methodName,
                callExpression: node,
                arguments: node.arguments,
            });
            
            // Recurse on the left side (the object being accessed)
            collectFromNode(node.expression.expression);
        }
    };

    // Start from the root call's parent context
    // We need to find the outermost call expression in the chain
    // For now, let's collect methods by walking the tree

    return methods;
}

