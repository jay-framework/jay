import {
    BindingName,
    Expression,
    FunctionLikeDeclarationBase,
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
} from 'typescript';

export interface Variable {
    name?: string;
    accessedFrom?: Variable;
    accessedByProperty?: string;
    assignedFrom?: Variable;
    root?: ParameterDeclaration;
}

export function mkVariable(members: {
    name?: string;
    accessedFrom?: Variable;
    accessedByProperty?: string;
    assignedFrom?: Variable;
    root?: ParameterDeclaration;
}) {
    return Object.fromEntries(
        Object.entries(members).filter(([, value]) => value !== undefined),
    );
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
            return this.variables.has(expression.text) ? this.variables.get(expression.text) : {};
        } else {
            return {};
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
        if (this.variables.has(variableName)) return this.variables.get(variableName);
        else return {};
    }
}

interface FlattenedAccessChain {
    path: string[];
    root: ParameterDeclaration;
}
export function flattenVariable(variable: Variable): FlattenedAccessChain {
    if (variable.assignedFrom) return flattenVariable(variable.assignedFrom);
    if (variable.accessedFrom) {
        let flattenedAccess = flattenVariable(variable.accessedFrom);
        return {
            path: [...flattenedAccess.path, variable.accessedByProperty],
            root: flattenedAccess.root,
        };
    }
    return { path: [], root: variable.root };
}
