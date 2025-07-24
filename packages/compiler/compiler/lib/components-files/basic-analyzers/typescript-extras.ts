import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { isIdentifier, isPropertyAccessExpression,  } = tsModule;

export function isIdentifierOrPropertyAccessExpression(
    node: ts.Node,
): node is ts.Identifier | ts.PropertyAccessExpression {
    return isIdentifier(node) || isPropertyAccessExpression(node);
}

export function byAnd() {
    return (agg: boolean, value: boolean) => agg && value;
}
