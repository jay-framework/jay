import ts from 'typescript';

export function getObjectPropertiesMap(
    expression: ts.ObjectLiteralExpression,
): Record<string, ts.Expression> {
    return expression.properties.filter(ts.isPropertyAssignment).reduce((acc, property) => {
        const key = getKey(property);
        if (key) acc[getKey(property)] = property.initializer;
        return acc;
    }, {});
}

function getKey(property: ts.PropertyAssignment): string | undefined {
    const { name } = property;
    if (ts.isIdentifier(name)) return name.getText();
    if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression))
        return name.expression.text;
    return undefined;
}
