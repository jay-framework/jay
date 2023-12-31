import ts, {
    BindingName,
    Expression,
    FunctionLikeDeclarationBase,
    FunctionDeclaration,
    Identifier,
    isElementAccessExpression,
    isIdentifier,
    isObjectBindingPattern,
    isPropertyAccessExpression,
    isStringLiteral,
    ParameterDeclaration,
    PropertyAccessExpression,
    PropertyName,
    VariableStatement,
    isObjectLiteralExpression,
    isPropertyAssignment,
    isShorthandPropertyAssignment,
    isArrayBindingPattern,
    isBindingElement,
} from 'typescript';

export type VariableRoot = ParameterDeclaration | FunctionDeclaration;

export interface Variable {
    name?: string;
    accessedFrom?: Variable;
    accessedByProperty?: string;
    assignedFrom?: Variable;
    root?: ts.Node;
    properties?: Variable[];
}

export function mkVariable(members: {
    name?: string;
    accessedFrom?: Variable;
    accessedByProperty?: string;
    assignedFrom?: Variable;
    root?: VariableRoot;
    properties?: Variable[];
}) {
    return Object.fromEntries(Object.entries(members).filter(([, value]) => value !== undefined));
}

const getAccessedByProperty = (
    binding: Identifier,
    accessedFrom?: Variable,
    propertyName?: PropertyName,
) => {
    return accessedFrom
        ? propertyName
            ? isIdentifier(propertyName)
                ? propertyName.text
                : undefined
            : binding.text
        : undefined;
};

export function tsBindingNameToVariable(
    binding: BindingName,
    accessedFrom?: Variable,
    assignedFrom?: Variable,
    propertyName?: PropertyName,
    root?: ParameterDeclaration,
): Variable[] {
    if (isIdentifier(binding)) {
        return [
            mkVariable({
                name: binding.text,
                accessedFrom,
                accessedByProperty: getAccessedByProperty(binding, accessedFrom, propertyName),
                assignedFrom,
                root,
            }),
        ];
    } else if (isObjectBindingPattern(binding)) {
        let variable: Variable = mkVariable({
            accessedFrom,
            accessedByProperty: propertyName
                ? isIdentifier(propertyName)
                    ? propertyName.text
                    : undefined
                : undefined,
            assignedFrom,
            root,
        });
        return binding.elements.flatMap((element) => {
            return tsBindingNameToVariable(element.name, variable, undefined, element.propertyName);
        });
    } else if (isArrayBindingPattern(binding)) {
        let variable: Variable = mkVariable({
            accessedFrom,
            accessedByProperty: propertyName
                ? isIdentifier(propertyName)
                    ? propertyName.text
                    : undefined
                : undefined,
            assignedFrom,
            root,
        });
        return binding.elements
            .flatMap((element, index) => {
                /*this is ugly - to pass the index as an identifier. maybe worth replacing it with usage of TS node factory? */
                return (
                    isBindingElement(element) &&
                    tsBindingNameToVariable(element.name, variable, undefined, {
                        kind: 80,
                        text: '' + index,
                    } as Identifier)
                );
            })
            .filter((variable) => !!variable);
    }
}

export class NameBindingResolver {
    variables: Map<string, Variable> = new Map();

    addVariable(name: string, variable: Variable) {
        this.variables.set(name, variable);
    }

    addFunctionParams(functionDeclaration: FunctionLikeDeclarationBase) {
        functionDeclaration.parameters.map((param) => {
            let paramVariables = tsBindingNameToVariable(
                param.name,
                undefined,
                undefined,
                undefined,
                param,
            );
            paramVariables.forEach((variable) => {
                if (variable.name) this.variables.set(variable.name, variable);
            });
        });
    }

    getVariable(name: string) {
        return this.variables.get(name) || {};
    }

    resolvePropertyAccessChain(expression: Expression): Variable {
        if (isPropertyAccessExpression(expression)) {
            const name = expression.name.text;
            const identifiersFromObject = this.resolvePropertyAccessChain(expression.expression);
            return { accessedFrom: identifiersFromObject, accessedByProperty: name };
        } else if (
            isElementAccessExpression(expression) &&
            isStringLiteral(expression.argumentExpression)
        ) {
            const name = expression.argumentExpression.text;
            const identifiersFromObject = this.resolvePropertyAccessChain(expression.expression);
            return { accessedFrom: identifiersFromObject, accessedByProperty: name };
        } else if (isIdentifier(expression)) {
            return this.resolveIdentifier(expression);
        } else if (isObjectLiteralExpression(expression)) {
            return {
                properties: expression.properties.map((property) => {
                    if (
                        isPropertyAssignment(property) &&
                        (isStringLiteral(property.name) || isIdentifier(property.name))
                    ) {
                        if (isIdentifier(property.initializer))
                            return {
                                name: property.name.text,
                                assignedFrom: this.resolveIdentifier(property.initializer),
                            };
                        else if (isObjectLiteralExpression(property.initializer)) {
                            let nestedProperty = this.resolvePropertyAccessChain(
                                property.initializer,
                            );
                            nestedProperty.name = property.name.text;
                            return nestedProperty;
                        } else return { name: property.name.text, root: property.initializer };
                    } else if (isShorthandPropertyAssignment(property))
                        return {
                            name: property.name.text,
                            assignedFrom: this.resolveIdentifier(property.name),
                        };
                }),
            };
        } else {
            return { root: expression };
        }
    }

    addVariableStatement(variableStatement: VariableStatement) {
        variableStatement.declarationList.declarations.forEach((declaration) => {
            let rightSide = this.resolvePropertyAccessChain(declaration.initializer);
            let declaredVariable = tsBindingNameToVariable(
                declaration.name,
                undefined,
                rightSide,
                undefined,
            );
            declaredVariable.forEach((variable) => this.variables.set(variable.name, variable));
        });
    }

    resolvePropertyAccess(expression: PropertyAccessExpression): Variable {
        return this.resolvePropertyAccessChain(expression);
    }

    resolveIdentifier(expression: Identifier): Variable {
        let variableName = expression.text;
        return this.getVariable(variableName);
    }

    addFunctionDeclaration(statement: FunctionDeclaration) {
        if (statement.name) {
            let functionVariable = mkVariable({ name: statement.name.text, root: statement });
            this.variables.set(statement.name.text, functionVariable);
        }
    }
}

interface FlattenedAccessChain {
    path: string[];
    root: ts.Node;
}
export function flattenVariable(variable: Variable, path: string[] = []): FlattenedAccessChain {
    if (variable.assignedFrom) return flattenVariable(variable.assignedFrom, path);
    else if (variable.accessedFrom) {
        return flattenVariable(variable.accessedFrom, [variable.accessedByProperty, ...path]);
    } else if (variable.properties && !!variable.properties.find((_) => _.name === path[0])) {
        return flattenVariable(
            variable.properties.find((_) => _.name === path[0]),
            path.slice(1),
        );
    } else return { path, root: variable.root };
}
