import { isFunctionLikeDeclarationBase } from '../../lib/ts-file/ts-compiler-utils.ts';
import ts, {
    ExpressionStatement,
    isVariableStatement,
    FunctionDeclaration,
    PropertyAccessExpression,
    VariableStatement,
    Expression,
    ObjectLiteralExpression,
    PropertyAssignment,
    CallExpression,
} from 'typescript';
import {
    tsBindingNameToVariable,
    NameBindingResolver,
    flattenVariable,
} from '../../lib/ts-file/building-blocks/name-binding-resolver';

function toSourceFile(code: string) {
    return ts.createSourceFile('dummy.ts', code, ts.ScriptTarget.Latest, true);
}

function getAstNode(code: string, index: number = 0): ts.Node {
    let sourceFile = toSourceFile(code);
    return sourceFile.statements[index];
}

const ASSIGNMENT_RIGHT_SIDE_PLACEHOLDER = { name: 'ASSIGNMENT_RIGHT_SIDE_PLACEHOLDER' };
const ParameterDeclarationPlaceholder: Expression = {} as Expression;

describe('NameBindingResolver', () => {
    describe('bindingNameToVariable', () => {
        it('should extract variable name from left side binding', () => {
            let node = getAstNode('let identifier = 5');
            let variableStatement = isVariableStatement(node) && node;
            let declaration = variableStatement.declarationList.declarations[0];

            let variables = tsBindingNameToVariable(
                declaration.name,
                undefined,
                ASSIGNMENT_RIGHT_SIDE_PLACEHOLDER,
            );

            expect(variables.length).toBe(1);
            expect(variables[0]).toEqual({
                name: 'identifier',
                assignedFrom: ASSIGNMENT_RIGHT_SIDE_PLACEHOLDER,
            });
        });

        it('should extract one level bindings from left side binding', () => {
            let statement = getAstNode('let {a} = {a: 5}');
            let variableStatement = isVariableStatement(statement) && statement;
            let declaration = variableStatement.declarationList.declarations[0];

            let variables = tsBindingNameToVariable(
                declaration.name,
                undefined,
                ASSIGNMENT_RIGHT_SIDE_PLACEHOLDER,
            );

            expect(variables.length).toBe(1);
            expect(variables[0]).toEqual({
                name: 'a',
                accessedByProperty: 'a',
                accessedFrom: {
                    assignedFrom: ASSIGNMENT_RIGHT_SIDE_PLACEHOLDER,
                },
            });
            expect(variables[0].name).toBe('a');
            expect(variables[0].accessedByProperty).toBe('a');
            expect(variables[0].accessedFrom).toBeDefined();
            expect(variables[0].accessedFrom.name).not.toBeDefined();
            expect(variables[0].accessedFrom.accessedByProperty).not.toBeDefined();
            expect(variables[0].accessedFrom.accessedFrom).not.toBeDefined();
        });
    });

    describe('resolve function params', () => {
        it('should resolve regular parameters', () => {
            let node = getAstNode('function bla(a: string, b: number) {}');
            let functionStatement = isFunctionLikeDeclarationBase(node) && node;

            let nameResolver = new NameBindingResolver();
            nameResolver.addFunctionParams(functionStatement);

            expect(nameResolver.variables.has('a')).toBeTruthy();
            expect(nameResolver.variables.get('a')).toEqual({
                name: 'a',
                root: functionStatement.parameters[0],
            });
            expect(flattenVariable(nameResolver.variables.get('a'))).toEqual({
                path: [],
                root: functionStatement.parameters[0],
            });

            expect(nameResolver.variables.has('b')).toBeTruthy();
            expect(nameResolver.variables.get('b')).toEqual({
                name: 'b',
                root: functionStatement.parameters[1],
            });
            expect(flattenVariable(nameResolver.variables.get('b'))).toEqual({
                path: [],
                root: functionStatement.parameters[1],
            });
        });

        it('should resolve one level deconstructed parameters', () => {
            let node = getAstNode('function bla({a, b}: SomeType) {}');
            let functionStatement = isFunctionLikeDeclarationBase(node) && node;

            let nameResolver = new NameBindingResolver();
            nameResolver.addFunctionParams(functionStatement);

            expect(nameResolver.variables.has('a')).toBeTruthy();
            let a = nameResolver.variables.get('a');
            expect(a).toEqual({
                name: 'a',
                accessedByProperty: 'a',
                accessedFrom: {
                    root: functionStatement.parameters[0],
                },
            });
            expect(flattenVariable(a)).toEqual({
                path: ['a'],
                root: functionStatement.parameters[0],
            });

            let b = nameResolver.variables.get('b');
            expect(b).toEqual({
                name: 'b',
                accessedByProperty: 'b',
                accessedFrom: {
                    root: functionStatement.parameters[0],
                },
            });
            expect(flattenVariable(b)).toEqual({
                path: ['b'],
                root: functionStatement.parameters[0],
            });
        });

        it('should resolve one level deconstructed parameters with renaming', () => {
            let node = getAstNode('function bla({a: z}: SomeType) {}');
            let functionStatement = isFunctionLikeDeclarationBase(node) && node;

            let nameResolver = new NameBindingResolver();
            nameResolver.addFunctionParams(functionStatement);

            expect(nameResolver.variables.has('z')).toBeTruthy();
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                accessedByProperty: 'a',
                accessedFrom: {
                    root: functionStatement.parameters[0],
                },
            });
            expect(flattenVariable(z)).toEqual({
                path: ['a'],
                root: functionStatement.parameters[0],
            });
        });

        it('should resolve two levels deconstructed parameters', () => {
            let node = getAstNode('function bla({a:{c}}: AnotherType) {}');
            let functionStatement = isFunctionLikeDeclarationBase(node) && node;

            let nameResolver = new NameBindingResolver();
            nameResolver.addFunctionParams(functionStatement);

            let c = nameResolver.variables.get('c');
            expect(c).toEqual({
                name: 'c',
                accessedByProperty: 'c',
                accessedFrom: {
                    accessedByProperty: 'a',
                    accessedFrom: {
                        root: functionStatement.parameters[0],
                    },
                },
            });
            expect(flattenVariable(c)).toEqual({
                path: ['a', 'c'],
                root: functionStatement.parameters[0],
            });
        });

        it('should resolve combination of decomposed parameters', () => {
            let node = getAstNode('function bla({a:{c,d},e}: AnotherType) {}');
            let functionStatement = isFunctionLikeDeclarationBase(node) && node;

            let nameResolver = new NameBindingResolver();
            nameResolver.addFunctionParams(functionStatement);

            let c = nameResolver.variables.get('c');
            expect(c).toEqual({
                name: 'c',
                accessedByProperty: 'c',
                accessedFrom: {
                    accessedByProperty: 'a',
                    accessedFrom: {
                        root: functionStatement.parameters[0],
                    },
                },
            });
            expect(flattenVariable(c)).toEqual({
                path: ['a', 'c'],
                root: functionStatement.parameters[0],
            });

            let d = nameResolver.variables.get('d');
            expect(d).toEqual({
                name: 'd',
                accessedByProperty: 'd',
                accessedFrom: {
                    accessedByProperty: 'a',
                    accessedFrom: {
                        root: functionStatement.parameters[0],
                    },
                },
            });
            expect(flattenVariable(d)).toEqual({
                path: ['a', 'd'],
                root: functionStatement.parameters[0],
            });

            let e = nameResolver.variables.get('e');
            expect(e).toEqual({
                name: 'e',
                accessedByProperty: 'e',
                accessedFrom: {
                    root: functionStatement.parameters[0],
                },
            });
            expect(flattenVariable(e)).toEqual({
                path: ['e'],
                root: functionStatement.parameters[0],
            });
        });
    });

    describe('resolve variable assignment', () => {
        function resolveNamesForVariableStatement(code: string) {
            let nameResolver = new NameBindingResolver();
            nameResolver.addVariable('a', { name: 'a', root: ParameterDeclarationPlaceholder });
            let node = getAstNode(code) as VariableStatement;
            nameResolver.addVariableStatement(node);
            let a = nameResolver.variables.get('a');
            return { nameResolver, a, node };
        }

        it('resolve let z = a', () => {
            let { a, nameResolver } = resolveNamesForVariableStatement('let z = a');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                assignedFrom: a,
            });
            expect(flattenVariable(z)).toEqual({ path: [], root: ParameterDeclarationPlaceholder });
        });

        it('resolve let z = a.b.c', () => {
            let { a, nameResolver } = resolveNamesForVariableStatement('let z = a.b.c');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                assignedFrom: {
                    accessedByProperty: 'c',
                    accessedFrom: {
                        accessedByProperty: 'b',
                        accessedFrom: a,
                    },
                },
            });
            expect(flattenVariable(z)).toEqual({
                path: ['b', 'c'],
                root: ParameterDeclarationPlaceholder,
            });
        });

        it('resolve let {z} = a', () => {
            let { a, nameResolver } = resolveNamesForVariableStatement('let {z} = a');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                accessedByProperty: 'z',
                accessedFrom: {
                    assignedFrom: a,
                },
            });
            expect(flattenVariable(z)).toEqual({
                path: ['z'],
                root: ParameterDeclarationPlaceholder,
            });
        });

        it(`resolve let z = a['b']`, () => {
            let { a, nameResolver } = resolveNamesForVariableStatement(`let z = a['b']`);

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                assignedFrom: {
                    accessedByProperty: 'b',
                    accessedFrom: a,
                },
            });
            expect(flattenVariable(z)).toEqual({
                path: ['b'],
                root: ParameterDeclarationPlaceholder,
            });
        });

        it(`resolve let z = {y: a}; then resolve z.y to a`, () => {
            let { a, nameResolver } = resolveNamesForVariableStatement(`let z = {y: a}`);

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                assignedFrom: {
                    properties: [
                        {
                            name: 'y',
                            assignedFrom: a,
                        },
                    ],
                },
            });
            let zy = nameResolver.resolvePropertyAccessChain(
                (getAstNode('z.y') as ExpressionStatement).expression,
            );
            expect(flattenVariable(zy)).toEqual({
                path: [],
                root: ParameterDeclarationPlaceholder,
            });
        });

        it(`resolve let z = {y: {x: a}}; then resolve z.y.x to a`, () => {
            let { a, nameResolver } = resolveNamesForVariableStatement(`let z = {y: {x: a}}`);

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                assignedFrom: {
                    properties: [
                        {
                            name: 'y',
                            properties: [
                                {
                                    name: 'x',
                                    assignedFrom: a,
                                },
                            ],
                        },
                    ],
                },
            });

            let zy = nameResolver.resolvePropertyAccessChain(
                (getAstNode('z.y.x') as ExpressionStatement).expression,
            );
            expect(flattenVariable(zy)).toEqual({
                path: [],
                root: ParameterDeclarationPlaceholder,
            });
        });

        it('resolve let z = {a: function() {}}; then resolve z.a to the function', () => {
            let { node, nameResolver } = resolveNamesForVariableStatement(
                'let z = {a: function() {}}',
            );
            let declaredInlineFunction = (
                (node.declarationList.declarations[0].initializer as ObjectLiteralExpression)
                    .properties[0] as PropertyAssignment
            ).initializer;

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                assignedFrom: {
                    properties: [{ name: 'a', root: declaredInlineFunction }],
                },
            });

            let za = nameResolver.resolvePropertyAccessChain(
                (getAstNode('z.a') as ExpressionStatement).expression,
            );
            expect(flattenVariable(za)).toEqual({ path: [], root: declaredInlineFunction });
        });

        it('resolve let [state, getState] = createState()', () => {
            let { node, nameResolver } = resolveNamesForVariableStatement(
                'let [state, getState] = createState()',
            );
            let createStateFunction = node.declarationList.declarations[0]
                .initializer as CallExpression;

            expect(nameResolver.variables.has('state'));
            let state = nameResolver.variables.get('state');
            expect(state).toEqual({
                name: 'state',
                accessedByProperty: '0',
                accessedFrom: {
                    assignedFrom: {
                        root: createStateFunction,
                    },
                },
            });
            expect(flattenVariable(state)).toEqual({
                path: ['0'],
                root: createStateFunction,
            });

            expect(nameResolver.variables.has('getState'));
            let getState = nameResolver.variables.get('getState');
            expect(getState).toEqual({
                name: 'getState',
                accessedByProperty: '1',
                accessedFrom: {
                    assignedFrom: {
                        root: createStateFunction,
                    },
                },
            });
            expect(flattenVariable(getState)).toEqual({
                path: ['1'],
                root: createStateFunction,
            });
        });
    });

    describe('resolve function definition', () => {
        function resolveNamesForFunctionDeclaration(code: string) {
            let nameResolver = new NameBindingResolver();
            let func = getAstNode(code) as FunctionDeclaration;
            nameResolver.addFunctionDeclaration(func);
            return { nameResolver, func };
        }

        it('resolve function declaration', () => {
            let { func, nameResolver } = resolveNamesForFunctionDeclaration('function bla() {}');

            expect(nameResolver.variables.has('bla'));
            let bla = nameResolver.variables.get('bla');
            expect(bla).toEqual({
                name: 'bla',
                root: func,
            });
        });
    });

    describe('resolve property access chain', () => {
        it(`resolve property access chain`, () => {
            let nameResolver = new NameBindingResolver();
            nameResolver.addVariable('a', { name: 'a', root: ParameterDeclarationPlaceholder });
            let node = getAstNode('a.b.c') as ExpressionStatement;

            let resolvedVariable = nameResolver.resolvePropertyAccess(
                node.expression as PropertyAccessExpression,
            );

            expect(resolvedVariable).toEqual({
                accessedByProperty: 'c',
                accessedFrom: {
                    accessedByProperty: 'b',
                    accessedFrom: {
                        name: 'a',
                        root: ParameterDeclarationPlaceholder,
                    },
                },
            });
            expect(flattenVariable(resolvedVariable)).toEqual({
                path: ['b', 'c'],
                root: ParameterDeclarationPlaceholder,
            });
        });
    });
});
