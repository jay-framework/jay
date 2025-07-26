import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const { isIdentifier, isPropertyAccessExpression } = tsBridge;

export function isIdentifierOrPropertyAccessExpression(
    node: ts.Node,
): node is ts.Identifier | ts.PropertyAccessExpression {
    return isIdentifier(node) || isPropertyAccessExpression(node);
}

export function byAnd() {
    return (agg: boolean, value: boolean) => agg && value;
}
