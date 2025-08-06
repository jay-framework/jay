import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const { isIdentifier, isStringLiteral, isPropertyAssignment, isComputedPropertyName } = tsBridge;
export function getObjectPropertiesMap(
    expression: ts.ObjectLiteralExpression,
): Record<string, ts.Expression> {
    return expression.properties.filter(isPropertyAssignment).reduce((acc, property) => {
        const key = getKey(property);
        if (key) acc[getKey(property)] = property.initializer;
        return acc;
    }, {});
}

function getKey(property: ts.PropertyAssignment): string | undefined {
    const { name } = property;
    if (isIdentifier(name)) return name.getText();
    if (isComputedPropertyName(name) && isStringLiteral(name.expression))
        return name.expression.text;
    return undefined;
}
