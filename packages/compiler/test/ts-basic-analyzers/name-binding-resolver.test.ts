import { isFunctionLikeDeclarationBase } from '../../lib/ts-file/ts-utils/ts-compiler-utils';
import ts, {
    ExpressionStatement,
    isVariableStatement,
    FunctionDeclaration,
    PropertyAccessExpression,
    VariableStatement,
    ObjectLiteralExpression,
    PropertyAssignment,
    CallExpression,
    ParameterDeclaration,
    FunctionExpression,
    ImportDeclaration,
} from 'typescript';
import {
    tsBindingNameToVariable,
    NameBindingResolver,
    flattenVariable,
    mkParameterVariableRoot,
    mkFunctionVariableRoot,
    mkImportModuleVariableRoot,
    ImportType,
    VariableRootType,
    mkFunctionCallVariableRoot,
    mkLiteralVariableRoot,
    LetOrConst, mkGlobalVariableRoot, mkOtherVariableRoot,
} from '../../lib/ts-file/basic-analyzers/name-binding-resolver';

function toSourceFile(code: string) {
    return ts.createSourceFile('dummy.ts', code, ts.ScriptTarget.Latest, true);
}

function getAstNode(code: string, index: number = 0): ts.Node {
    let sourceFile = toSourceFile(code);
    return sourceFile.statements[index];
}

const ASSIGNMENT_RIGHT_SIDE_PLACEHOLDER = { name: 'ASSIGNMENT_RIGHT_SIDE_PLACEHOLDER' };
const PARAM_ROOT = mkParameterVariableRoot({} as ParameterDeclaration, 0);

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
                definingStatement: node,
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
                    definingStatement: statement,
                },
                definingStatement: statement,
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
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
                definingStatement: node,
            });
            expect(flattenVariable(nameResolver.variables.get('a'))).toEqual({
                path: [],
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
            });

            expect(nameResolver.variables.has('b')).toBeTruthy();
            expect(nameResolver.variables.get('b')).toEqual({
                name: 'b',
                root: mkParameterVariableRoot(functionStatement.parameters[1], 1),
                definingStatement: node,
            });
            expect(flattenVariable(nameResolver.variables.get('b'))).toEqual({
                path: [],
                root: mkParameterVariableRoot(functionStatement.parameters[1], 1),
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
                    root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(a)).toEqual({
                path: ['a'],
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
            });

            let b = nameResolver.variables.get('b');
            expect(b).toEqual({
                name: 'b',
                accessedByProperty: 'b',
                accessedFrom: {
                    root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(b)).toEqual({
                path: ['b'],
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
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
                    root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({
                path: ['a'],
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
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
                        root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
                        definingStatement: node,
                    },
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(c)).toEqual({
                path: ['a', 'c'],
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
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
                        root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
                        definingStatement: node,
                    },
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(c)).toEqual({
                path: ['a', 'c'],
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
            });

            let d = nameResolver.variables.get('d');
            expect(d).toEqual({
                name: 'd',
                accessedByProperty: 'd',
                accessedFrom: {
                    accessedByProperty: 'a',
                    accessedFrom: {
                        root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
                        definingStatement: node,
                    },
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(d)).toEqual({
                path: ['a', 'd'],
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
            });

            let e = nameResolver.variables.get('e');
            expect(e).toEqual({
                name: 'e',
                accessedByProperty: 'e',
                accessedFrom: {
                    root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(e)).toEqual({
                path: ['e'],
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
            });
        });

        it('should resolve varargs param', () => {
            let node = getAstNode('function bla(...a: SomeType[]) {}');
            let functionStatement = isFunctionLikeDeclarationBase(node) && node;

            let nameResolver = new NameBindingResolver();
            nameResolver.addFunctionParams(functionStatement);

            let a = nameResolver.variables.get('a');
            expect(a).toEqual({
                name: 'a',
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
                definingStatement: node,
            });
            expect(flattenVariable(a)).toEqual({
                path: [],
                root: mkParameterVariableRoot(functionStatement.parameters[0], 0),
            });
        })
    });

    describe('resolve variable assignment', () => {
        function resolveNamesForVariableStatement(code: string) {
            let nameResolver = new NameBindingResolver();
            nameResolver.addVariable('a', { name: 'a', root: PARAM_ROOT });
            let node = getAstNode(code) as VariableStatement;
            nameResolver.addVariableStatement(node);
            let a = nameResolver.variables.get('a');
            return { nameResolver, a, node };
        }

        it('resolve let z = a', () => {
            let { a, nameResolver, node } = resolveNamesForVariableStatement('let z = a');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                assignedFrom: a,
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({ path: [], root: PARAM_ROOT });
        });

        it('resolve let z', () => {
            let { a, nameResolver, node } = resolveNamesForVariableStatement('let z');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({ path: [], root: undefined });
        });

        it('resolve const z = a', () => {
            let { a, nameResolver, node } = resolveNamesForVariableStatement('const z = a');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.CONST,
                assignedFrom: a,
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({ path: [], root: PARAM_ROOT });
        });

        it('resolve var z = a', () => {
            let { a, nameResolver, node } = resolveNamesForVariableStatement('var z = a');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                assignedFrom: a,
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({ path: [], root: PARAM_ROOT });
        });

        it('resolve let z = a.b.c', () => {
            let { a, nameResolver, node } = resolveNamesForVariableStatement('let z = a.b.c');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                assignedFrom: {
                    accessedByProperty: 'c',
                    accessedFrom: {
                        accessedByProperty: 'b',
                        accessedFrom: a,
                    },
                },
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({
                path: ['b', 'c'],
                root: PARAM_ROOT,
            });
        });

        it('resolve let z = a.b.c()', () => {
            let { nameResolver, node } = resolveNamesForVariableStatement('let z = a.b.c()');
            let functionCallAsRoot = {
                kind: VariableRootType.FunctionCall,
                node: node.declarationList.declarations[0].initializer,
            };

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                assignedFrom: {
                    root: functionCallAsRoot,
                },
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({
                path: [],
                root: functionCallAsRoot,
            });
        });

        describe('resolve let z = a.b.c().d.e', () => {
            function doResolve() {
                const {a, nameResolver, node} = resolveNamesForVariableStatement('let z = a.b.c().d.e');
                const functionCallAsRoot = {
                    kind: VariableRootType.FunctionCall,
                    node: (
                        (node.declarationList.declarations[0].initializer as PropertyAccessExpression)
                            .expression as PropertyAccessExpression
                    ).expression as CallExpression,
                };
                return {a, nameResolver, node, functionCallAsRoot}
            }

            it('should resolve the z variable', () => {
                const {nameResolver, functionCallAsRoot, node} = doResolve();
                expect(nameResolver.variables.has('z'));
                let z = nameResolver.variables.get('z');
                expect(z).toEqual({
                    name: 'z',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        accessedByProperty: 'e',
                        accessedFrom: {
                            accessedByProperty: 'd',
                            accessedFrom: {
                                root: functionCallAsRoot,
                            },
                        },
                    },
                    definingStatement: node,
                });
                expect(flattenVariable(z)).toEqual({
                    path: ['d', 'e'],
                    root: functionCallAsRoot,
                });
            });
            it('should resolve the function reference expression', () => {
                const {nameResolver, functionCallAsRoot, node, a} = doResolve();
                let functionExpression = functionCallAsRoot.node.expression;
                let resolvedFunction = nameResolver.resolvePropertyAccessChain(functionExpression);
                expect(resolvedFunction).toEqual({
                    accessedByProperty: 'c',
                    accessedFrom: {
                        accessedByProperty: 'b',
                        accessedFrom: a,
                    },
                });
            });
        });

        it('resolve let z = (a.b as T).c', () => {
            let { a, nameResolver, node } =
                resolveNamesForVariableStatement('let z = (a.b as T).c');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                assignedFrom: {
                    accessedByProperty: 'c',
                    accessedFrom: {
                        accessedByProperty: 'b',
                        accessedFrom: a,
                    },
                },
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({
                path: ['b', 'c'],
                root: PARAM_ROOT,
            });
        });

        it('resolve let {z} = a', () => {
            let { a, nameResolver, node } = resolveNamesForVariableStatement('let {z} = a');

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                accessedByProperty: 'z',
                accessedFrom: {
                    assignedFrom: a,
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({
                path: ['z'],
                root: PARAM_ROOT,
            });
        });

        it(`resolve let z = a['b']`, () => {
            let { a, nameResolver, node } = resolveNamesForVariableStatement(`let z = a['b']`);

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                assignedFrom: {
                    accessedByProperty: 'b',
                    accessedFrom: a,
                },
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({
                path: ['b'],
                root: PARAM_ROOT,
            });
        });

        it(`resolve let z = {y: a}; then resolve z.y to a`, () => {
            let { a, nameResolver, node } = resolveNamesForVariableStatement(`let z = {y: a}`);

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                assignedFrom: {
                    properties: [
                        {
                            name: 'y',
                            assignedFrom: a,
                        },
                    ],
                },
                definingStatement: node,
            });
            let zy = nameResolver.resolvePropertyAccessChain(
                (getAstNode('z.y') as ExpressionStatement).expression,
            );
            expect(flattenVariable(zy)).toEqual({
                path: [],
                root: PARAM_ROOT,
            });
        });

        it(`resolve let z = {y: {x: a}}; then resolve z.y.x to a`, () => {
            let { a, nameResolver, node } = resolveNamesForVariableStatement(`let z = {y: {x: a}}`);

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
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
                definingStatement: node,
            });

            let zy = nameResolver.resolvePropertyAccessChain(
                (getAstNode('z.y.x') as ExpressionStatement).expression,
            );
            expect(flattenVariable(zy)).toEqual({
                path: [],
                root: PARAM_ROOT,
            });
        });

        it('resolve let z = {a: function() {}}; then resolve z.a to the function', () => {
            let { node, nameResolver } = resolveNamesForVariableStatement(
                'let z = {a: function() {}}',
            );
            let declaredInlineFunction = (
                (node.declarationList.declarations[0].initializer as ObjectLiteralExpression)
                    .properties[0] as PropertyAssignment
            ).initializer as FunctionExpression;

            expect(nameResolver.variables.has('z'));
            let z = nameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                assignedFrom: {
                    properties: [
                        { name: 'a', root: mkFunctionVariableRoot(declaredInlineFunction) },
                    ],
                },
                definingStatement: node,
            });

            let za = nameResolver.resolvePropertyAccessChain(
                (getAstNode('z.a') as ExpressionStatement).expression,
            );
            expect(flattenVariable(za)).toEqual({
                path: [],
                root: mkFunctionVariableRoot(declaredInlineFunction),
            });
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
                letOrConst: LetOrConst.LET,
                accessedByProperty: '0',
                accessedFrom: {
                    assignedFrom: {
                        root: mkFunctionCallVariableRoot(createStateFunction),
                    },
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(state)).toEqual({
                path: ['0'],
                root: mkFunctionCallVariableRoot(createStateFunction),
            });

            expect(nameResolver.variables.has('getState'));
            let getState = nameResolver.variables.get('getState');
            expect(getState).toEqual({
                name: 'getState',
                letOrConst: LetOrConst.LET,
                accessedByProperty: '1',
                accessedFrom: {
                    assignedFrom: {
                        root: mkFunctionCallVariableRoot(createStateFunction),
                    },
                    definingStatement: node,
                },
                definingStatement: node,
            });
            expect(flattenVariable(getState)).toEqual({
                path: ['1'],
                root: mkFunctionCallVariableRoot(createStateFunction),
            });
        });

        describe('literals', () => {
            it(`resolve let z = 'a'`, () => {
                let { nameResolver, node } = resolveNamesForVariableStatement(`let z = 'a'`);

                expect(nameResolver.variables.has('z'));
                let z = nameResolver.variables.get('z');
                let root = mkLiteralVariableRoot(node.declarationList.declarations[0].initializer);
                expect(z).toEqual({
                    name: 'z',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root,
                    },
                    definingStatement: node,
                });
                expect(flattenVariable(z)).toEqual({ path: [], root });
            });

            it(`resolve let z = 6`, () => {
                let { nameResolver, node } = resolveNamesForVariableStatement(`let z = 6`);

                expect(nameResolver.variables.has('z'));
                let z = nameResolver.variables.get('z');
                let root = mkLiteralVariableRoot(node.declarationList.declarations[0].initializer);
                expect(z).toEqual({
                    name: 'z',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root,
                    },
                    definingStatement: node,
                });
                expect(flattenVariable(z)).toEqual({ path: [], root });
            });

            it(`resolve let z = true`, () => {
                let { nameResolver, node } = resolveNamesForVariableStatement(`let z = true`);

                expect(nameResolver.variables.has('z'));
                let z = nameResolver.variables.get('z');
                let root = mkLiteralVariableRoot(node.declarationList.declarations[0].initializer);
                expect(z).toEqual({
                    name: 'z',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root,
                    },
                    definingStatement: node,
                });
                expect(flattenVariable(z)).toEqual({ path: [], root });
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
                root: mkFunctionVariableRoot(func),
                definingStatement: func,
            });
        });
    });

    describe('resolve property access chain', () => {
        it(`resolve property access chain`, () => {
            let nameResolver = new NameBindingResolver();
            nameResolver.addVariable('a', { name: 'a', root: PARAM_ROOT });
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
                        root: PARAM_ROOT,
                    },
                },
            });
            expect(flattenVariable(resolvedVariable)).toEqual({
                path: ['b', 'c'],
                root: PARAM_ROOT,
            });
        });
    });

    describe('resolve import variables', () => {
        function resolveNamesForVariableStatement(code: string) {
            let nameResolver = new NameBindingResolver();
            let importDeclaration = getAstNode(code) as ImportDeclaration;
            let moduleSpecifier = importDeclaration.moduleSpecifier;
            nameResolver.addImportDeclaration(importDeclaration);
            return { nameResolver, importDeclaration, moduleSpecifier };
        }

        it(`resolve import a from 'b (default import)'`, () => {
            let { nameResolver, importDeclaration, moduleSpecifier } =
                resolveNamesForVariableStatement("import a from 'b'");

            expect(nameResolver.variables.has('a'));
            let a = nameResolver.variables.get('a');
            expect(a).toEqual({
                name: 'a',
                definingStatement: importDeclaration,
                root: mkImportModuleVariableRoot(moduleSpecifier, ImportType.defaultImport),
            });
            expect(flattenVariable(a)).toEqual({
                path: [],
                root: mkImportModuleVariableRoot(moduleSpecifier, ImportType.defaultImport),
            });
        });

        it(`resolve import * as a from 'b' (namespace import)`, () => {
            let { nameResolver, importDeclaration, moduleSpecifier } =
                resolveNamesForVariableStatement("import * as a from 'b'");

            expect(nameResolver.variables.has('a'));
            let a = nameResolver.variables.get('a');
            expect(a).toEqual({
                name: 'a',
                definingStatement: importDeclaration,
                root: mkImportModuleVariableRoot(moduleSpecifier, ImportType.namedImport),
            });
            expect(flattenVariable(a)).toEqual({
                path: [],
                root: mkImportModuleVariableRoot(moduleSpecifier, ImportType.namedImport),
            });
        });

        it(`resolve import {a} from 'b'`, () => {
            let { nameResolver, importDeclaration, moduleSpecifier } =
                resolveNamesForVariableStatement("import {a} from 'b'");

            expect(nameResolver.variables.has('a'));
            let a = nameResolver.variables.get('a');
            expect(a).toEqual({
                name: 'a',
                accessedByProperty: 'a',
                accessedFrom: {
                    definingStatement: importDeclaration,
                    root: mkImportModuleVariableRoot(moduleSpecifier, ImportType.namedImport),
                },
                definingStatement: importDeclaration,
            });
            expect(flattenVariable(a)).toEqual({
                path: ['a'],
                root: mkImportModuleVariableRoot(moduleSpecifier, ImportType.namedImport),
            });
        });

        it(`resolve import 'b'`, () => {
            resolveNamesForVariableStatement("import 'b'");
        });

        it(`resolve import {a as c} from 'b'`, () => {
            let { nameResolver, importDeclaration, moduleSpecifier } =
                resolveNamesForVariableStatement("import {a as c} from 'b'");

            expect(nameResolver.variables.has('c'));
            let c = nameResolver.variables.get('c');
            expect(c).toEqual({
                name: 'c',
                accessedByProperty: 'a',
                accessedFrom: {
                    definingStatement: importDeclaration,
                    root: mkImportModuleVariableRoot(moduleSpecifier, ImportType.namedImport),
                },
                definingStatement: importDeclaration,
            });
            expect(flattenVariable(c)).toEqual({
                path: ['a'],
                root: mkImportModuleVariableRoot(moduleSpecifier, ImportType.namedImport),
            });
        });
    });

    describe('support resolve from globals', () => {
        function resolveNamesForVariableStatement(code: string) {
            let nameResolver = new NameBindingResolver();
            let variableStatement = getAstNode(code) as VariableStatement ;
            nameResolver.addVariableStatement(variableStatement);
            return { nameResolver, variableStatement };
        }

        it('resolve let log = console.log', () => {
            let { nameResolver, variableStatement } =
                resolveNamesForVariableStatement("let log = console.log");

            expect(nameResolver.variables.has('log'));
            let log = nameResolver.variables.get('log');
            expect(log).toEqual({
                name: 'log',
                assignedFrom: {
                    accessedFrom: {
                        root: mkGlobalVariableRoot('console')
                    },
                    accessedByProperty: 'log',
                },
                letOrConst: LetOrConst.LET,
                definingStatement: variableStatement,
            });
            expect(flattenVariable(log)).toEqual({
                path: ['log'],
                root: mkGlobalVariableRoot('console'),
            });

        })

        // it('should not resolve random variable as global, only from a list of known globals', () => {
        //     let { nameResolver, variableStatement } =
        //         resolveNamesForVariableStatement("let foo = bla.bla");
        //
        //     expect(nameResolver.variables.has('log'));
        //     let log = nameResolver.variables.get('log');
        //     const variableRoot = mkOtherVariableRoot((variableStatement
        //         .declarationList[0]
        //         .declarations[0]
        //         .initializer as PropertyAccessExpression)
        //         .expression);
        //     expect(log).toEqual({
        //         name: 'foo',
        //         assignedFrom: {
        //             accessedFrom: {
        //                 root: variableRoot
        //             },
        //             accessedByProperty: 'bla',
        //         },
        //         letOrConst: LetOrConst.LET,
        //         definingStatement: variableStatement,
        //     });
        //     expect(flattenVariable(log)).toEqual({
        //         path: ['bla'],
        //         root: variableRoot,
        //     });
        //
        // })

    })

    describe('support resolve identifier from parent scope', () => {
        function resolveNamesForVariableStatement(code: string) {
            let parentNameResolver = new NameBindingResolver();
            parentNameResolver.addVariable('a', { name: 'a', root: PARAM_ROOT });
            let childNameResolver = new NameBindingResolver(parentNameResolver);
            let node = getAstNode(code) as VariableStatement;
            childNameResolver.addVariableStatement(node);
            let a = parentNameResolver.variables.get('a');
            return { parentNameResolver, childNameResolver, a, node };
        }

        it('resolve let z = a', () => {
            let { a, childNameResolver, node } = resolveNamesForVariableStatement('let z = a');

            expect(childNameResolver.variables.has('z'));
            let z = childNameResolver.variables.get('z');
            expect(z).toEqual({
                name: 'z',
                letOrConst: LetOrConst.LET,
                assignedFrom: a,
                definingStatement: node,
            });
            expect(flattenVariable(z)).toEqual({ path: [], root: PARAM_ROOT });
        });
    });
});
