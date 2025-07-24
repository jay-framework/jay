import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const {
    isElementAccessExpression,
    isIdentifier,
    isObjectBindingPattern,
    isPropertyAccessExpression,
    isStringLiteral,
    isObjectLiteralExpression,
    isPropertyAssignment,
    isShorthandPropertyAssignment,
    isArrayBindingPattern,
    isBindingElement,
    isParenthesizedExpression,
    isAsExpression,
    isArrowFunction,
    isFunctionExpression,
    isStatement,
    isNamespaceImport,
    isNamedImports,
    isCallExpression,
    isNumericLiteral,
    isToken,
    SyntaxKind,
    NodeFlags,
} = tsModule;
export enum VariableRootType {
    FunctionParameter,
    FunctionDefinition,
    Literal,
    ImportModule,
    FunctionCall,
    Global,
    Other,
}

export interface VariableRoot {
    kind: VariableRootType;
}

export interface ParamVariableRoot extends VariableRoot {
    kind: VariableRootType.FunctionParameter;
    paramIndex: number;
    param: ts.ParameterDeclaration;
}
export function mkParameterVariableRoot(
    param: ts.ParameterDeclaration,
    paramIndex: number,
): ParamVariableRoot {
    return { kind: VariableRootType.FunctionParameter, param, paramIndex };
}

export interface FunctionVariableRoot extends VariableRoot {
    kind: VariableRootType.FunctionDefinition;
    func: ts.FunctionLikeDeclarationBase;
}

export function mkFunctionVariableRoot(func: ts.FunctionLikeDeclarationBase): FunctionVariableRoot {
    return { kind: VariableRootType.FunctionDefinition, func };
}

export interface LiteralVariableRoot extends VariableRoot {
    kind: VariableRootType.Literal;
    literal: ts.Expression;
}

export function mkLiteralVariableRoot(literal: ts.Expression): LiteralVariableRoot {
    return { kind: VariableRootType.Literal, literal };
}

export enum ImportType {
    defaultImport,
    namedImport,
}

export interface ImportModuleVariableRoot extends VariableRoot {
    kind: VariableRootType.ImportModule;
    module: ts.Expression;
    importType: ImportType;
}

export function mkImportModuleVariableRoot(
    module: ts.Expression,
    importType: ImportType,
): ImportModuleVariableRoot {
    return { kind: VariableRootType.ImportModule, module, importType };
}

export interface FunctionCallVariableRoot extends VariableRoot {
    kind: VariableRootType.FunctionCall;
    node: ts.CallExpression;
}

export function mkFunctionCallVariableRoot(node: ts.CallExpression): FunctionCallVariableRoot {
    return { kind: VariableRootType.FunctionCall, node };
}

export interface GlobalVariableRoot extends VariableRoot {
    kind: VariableRootType.Global;
    name: string;
}

export function mkGlobalVariableRoot(name: string): GlobalVariableRoot {
    return { kind: VariableRootType.Global, name };
}

export interface OtherVariableRoot extends VariableRoot {
    kind: VariableRootType.Other;
    node: ts.Node;
}

export function mkOtherVariableRoot(node: ts.Node): OtherVariableRoot {
    return { kind: VariableRootType.Other, node };
}

export function isParamVariableRoot(vr: VariableRoot): vr is ParamVariableRoot {
    return vr.kind === VariableRootType.FunctionParameter;
}
export function isFunctionVariableRoot(vr: VariableRoot): vr is FunctionVariableRoot {
    return vr.kind === VariableRootType.FunctionDefinition;
}

export function isImportModuleVariableRoot(vr: VariableRoot): vr is ImportModuleVariableRoot {
    return vr.kind === VariableRootType.ImportModule;
}
export function isLiteralVariableRoot(vr: VariableRoot): vr is LiteralVariableRoot {
    return vr.kind === VariableRootType.Literal;
}
export function isFunctionCallVariableRoot(vr: VariableRoot): vr is FunctionCallVariableRoot {
    return vr.kind === VariableRootType.FunctionCall;
}
export function isGlobalVariableRoot(vr: VariableRoot): vr is GlobalVariableRoot {
    return vr.kind === VariableRootType.Global;
}
export function isOtherVariableRoot(vr: VariableRoot): vr is OtherVariableRoot {
    return vr.kind === VariableRootType.Other;
}

export enum LetOrConst {
    LET,
    CONST,
}

export interface Variable {
    name?: string;
    letOrConst?: LetOrConst;
    definingStatement?: ts.Statement;
    accessedFrom?: Variable;
    accessedByProperty?: string;
    assignedFrom?: Variable;
    root?: VariableRoot;
    properties?: Variable[];
}

export function mkVariable(members: {
    name?: string;
    letOrConst?: LetOrConst;
    definingStatement?: ts.Statement;
    accessedFrom?: Variable;
    accessedByProperty?: string;
    assignedFrom?: Variable;
    root?: VariableRoot;
    properties?: Variable[];
}) {
    return Object.fromEntries(Object.entries(members).filter(([, value]) => value !== undefined));
}

export const UNKNOWN_VARIABLE: Variable = {};

const getAccessedByProperty = (
    binding: ts.Identifier,
    accessedFrom?: Variable,
    propertyName?: ts.PropertyName,
) => {
    return accessedFrom
        ? propertyName
            ? isIdentifier(propertyName)
                ? propertyName.text
                : undefined
            : binding.text
        : undefined;
};

function findDeclaringStatement(node: ts.Node): ts.Statement {
    if (!node) return undefined;
    else if (isStatement(node)) return node;
    else return findDeclaringStatement(node.parent);
}

export function tsBindingNameToVariable(
    binding: ts.BindingName,
    accessedFrom?: Variable,
    assignedFrom?: Variable,
    propertyName?: ts.PropertyName,
    root?: ParamVariableRoot,
): Variable[] {
    if (isIdentifier(binding)) {
        return [
            mkVariable({
                name: binding.text,
                accessedFrom,
                accessedByProperty: getAccessedByProperty(binding, accessedFrom, propertyName),
                assignedFrom,
                root,
                definingStatement: findDeclaringStatement(binding),
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
            definingStatement: findDeclaringStatement(binding),
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
            definingStatement: findDeclaringStatement(binding),
        });
        return binding.elements
            .flatMap((element, index) => {
                /*this is ugly - to pass the index as an identifier. maybe worth replacing it with usage of TS node factory? */
                return (
                    isBindingElement(element) &&
                    tsBindingNameToVariable(element.name, variable, undefined, {
                        kind: 80,
                        text: '' + index,
                    } as ts.Identifier)
                );
            })
            .filter((variable) => !!variable);
    }
}

export class NameBindingResolver {
    constructor(readonly parentNameResolver?: NameBindingResolver) {}

    variables: Map<string, Variable> = new Map();

    addVariable(name: string, variable: Variable) {
        this.variables.set(name, variable);
    }

    addFunctionParams(functionDeclaration: ts.FunctionLikeDeclarationBase) {
        functionDeclaration.parameters.map((param, paramIndex) => {
            let paramVariables = tsBindingNameToVariable(
                param.name,
                undefined,
                undefined,
                undefined,
                mkParameterVariableRoot(param, paramIndex),
            );
            paramVariables.forEach((variable) => {
                if (variable.name) this.variables.set(variable.name, variable);
            });
        });
    }

    addFunctionDeclaration(statement: ts.FunctionDeclaration) {
        if (statement.name) {
            let functionVariable = mkVariable({
                name: statement.name.text,
                root: mkFunctionVariableRoot(statement),
                definingStatement: statement,
            });
            this.variables.set(statement.name.text, functionVariable);
        }
    }

    addVariableDeclarationList(declarationList: ts.VariableDeclarationList) {
        const letOrConst =
            declarationList.flags === NodeFlags.Const ? LetOrConst.CONST : LetOrConst.LET;
        declarationList.declarations.forEach((declaration) => {
            let rightSide = declaration.initializer
                ? this.resolvePropertyAccessChain(declaration.initializer)
                : undefined;
            let declaredVariable = tsBindingNameToVariable(
                declaration.name,
                undefined,
                rightSide,
                undefined,
            );
            declaredVariable.forEach((variable) =>
                this.variables.set(variable.name, { ...variable, letOrConst }),
            );
        });
    }

    addVariableStatement(variableStatement: ts.VariableStatement) {
        this.addVariableDeclarationList(variableStatement.declarationList);
    }

    getVariable(name: string) {
        return this.variables.get(name) || UNKNOWN_VARIABLE;
    }

    resolvePropertyAccessChain(expression: ts.Expression): Variable {
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
        } else if (isParenthesizedExpression(expression)) {
            return this.resolvePropertyAccessChain(expression.expression);
        } else if (isAsExpression(expression)) {
            return this.resolvePropertyAccessChain(expression.expression);
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
                        } else if (
                            isArrowFunction(property.initializer) ||
                            isFunctionExpression(property.initializer)
                        ) {
                            return {
                                name: property.name.text,
                                root: mkFunctionVariableRoot(property.initializer),
                            };
                        } else
                            return {
                                name: property.name.text,
                                root: mkLiteralVariableRoot(property.initializer),
                            };
                    } else if (isShorthandPropertyAssignment(property))
                        return {
                            name: property.name.text,
                            assignedFrom: this.resolveIdentifier(property.name),
                        };
                }),
            };
        } else if (isArrowFunction(expression) || isFunctionExpression(expression)) {
            return { root: mkFunctionVariableRoot(expression) };
        } else if (isCallExpression(expression)) {
            return { root: mkFunctionCallVariableRoot(expression) };
        } else if (
            isStringLiteral(expression) ||
            isNumericLiteral(expression) ||
            (isToken(expression) && expression.kind === SyntaxKind.TrueKeyword) ||
            (isToken(expression) && expression.kind === SyntaxKind.FalseKeyword)
        ) {
            return { root: mkLiteralVariableRoot(expression) };
        } else {
            return { root: mkOtherVariableRoot(expression) };
        }
    }

    resolvePropertyAccess(expression: ts.PropertyAccessExpression): Variable {
        return this.resolvePropertyAccessChain(expression);
    }

    resolveIdentifier(expression: ts.Identifier): Variable {
        let variableName = expression.text;
        let nameResolver: NameBindingResolver = this;
        let resolved: Variable;
        while (
            (resolved = nameResolver.getVariable(variableName)) === UNKNOWN_VARIABLE &&
            nameResolver.parentNameResolver
        )
            nameResolver = nameResolver.parentNameResolver;
        if (resolved === UNKNOWN_VARIABLE) return { root: mkGlobalVariableRoot(variableName) };
        return resolved;
    }

    addImportDeclaration(node: ts.ImportDeclaration) {
        // let root = mkImportModuleVariableRoot(node.moduleSpecifier);
        if (node.importClause?.name) {
            let root = mkImportModuleVariableRoot(node.moduleSpecifier, ImportType.defaultImport);
            let variable = mkVariable({
                name: node.importClause.name.text,
                definingStatement: node,
                root,
            });
            this.variables.set(node.importClause.name.text, variable);
        }
        if (node.importClause?.namedBindings) {
            let root = mkImportModuleVariableRoot(node.moduleSpecifier, ImportType.namedImport);
            let namedBindings = node.importClause.namedBindings;
            if (isNamespaceImport(namedBindings)) {
                let variable = mkVariable({
                    name: namedBindings.name.text,
                    definingStatement: node,
                    root,
                });
                this.variables.set(namedBindings.name.text, variable);
            } else if (isNamedImports(namedBindings)) {
                namedBindings.elements.forEach((importSpecifier) => {
                    if (!importSpecifier.isTypeOnly) {
                        let variable = mkVariable({
                            name: importSpecifier.name.text,
                            accessedByProperty: (
                                importSpecifier.propertyName || importSpecifier.name
                            ).text,
                            accessedFrom: {
                                definingStatement: node,
                                root,
                            },
                            definingStatement: node,
                        });
                        this.variables.set(importSpecifier.name.text, variable);
                    }
                });
            }
        }
    }
}

export interface FlattenedAccessChain {
    path: string[];
    root: VariableRoot;
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
