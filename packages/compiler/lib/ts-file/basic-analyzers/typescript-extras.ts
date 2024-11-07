import ts, {
    Identifier,
    isIdentifier,
    isPropertyAccessExpression,
    PropertyAccessExpression,
} from 'typescript';

export function isIdentifierOrPropertyAccessExpression(
    node: ts.Node,
): node is Identifier | PropertyAccessExpression {
    return isIdentifier(node) || isPropertyAccessExpression(node);
}

export function byAnd() {
    return (agg: boolean, value: boolean) => agg && value;
}
