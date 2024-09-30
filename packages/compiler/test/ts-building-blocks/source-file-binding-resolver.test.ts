import { createTsSourceFile } from '../test-utils/ts-source-utils';
import {
    ArrowFunction,
    BinaryExpression,
    Block,
    CallExpression,
    ExpressionStatement,
    ForStatement,
    FunctionDeclaration,
    Identifier,
    PropertyAccessExpression,
    VariableDeclarationList,
    VariableStatement,
    WhileStatement,
} from 'typescript';
import {
    LetOrConst,
    mkLiteralVariableRoot,
    mkOtherVariableRoot,
    mkParameterVariableRoot,
    UNKNOWN_VARIABLE,
} from '../../lib/ts-file/building-blocks/name-binding-resolver';
import { SourceFileBindingResolver } from '../../lib/ts-file/building-blocks/source-file-binding-resolver';

describe('SourceFileBindingResolver', () => {
    describe('resolve variables', () => {
        const sourceFile = createTsSourceFile(`
            let x = 10;
            let y = x + 1;
            console.log(y)`);

        let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);

        it('should resolve variable x defining statement', () => {
            expect(
                sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('x')
                    .definingStatement,
            ).toEqual(sourceFile.statements[0]);
        });

        it('should explain the identifier x on the 2nd line', () => {
            expect(
                sourceFileBindingResolver.explain(
                    (
                        (sourceFile.statements[1] as VariableStatement).declarationList
                            .declarations[0].initializer as BinaryExpression
                    ).left as Identifier,
                ),
            ).toEqual(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('x'));
        });

        it('should resolve variable y defining statement', () => {
            expect(
                sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('y')
                    .definingStatement,
            ).toEqual(sourceFile.statements[1]);
        });

        it('should explain the identifier y on the 3rd line', () => {
            expect(
                sourceFileBindingResolver.explain(
                    ((sourceFile.statements[2] as ExpressionStatement).expression as CallExpression)
                        .arguments[0] as Identifier,
                ),
            ).toEqual(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('y'));
        });
    });

    describe('resolve imported variables', () => {
        const sourceFile = createTsSourceFile(`
            import x from 'bla';
            let y = x + 1;
            console.log(y)`);

        let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);

        it('should resolve imported variable x defining statement', () => {
            expect(
                sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('x')
                    .definingStatement,
            ).toEqual(sourceFile.statements[0]);
        });

        it('should explain the identifier x on the 2rd line', () => {
            expect(
                sourceFileBindingResolver.explain(
                    (
                        (sourceFile.statements[1] as VariableStatement).declarationList
                            .declarations[0].initializer as BinaryExpression
                    ).left as Identifier,
                ),
            ).toEqual(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('x'));
        });

        it('should resolve imported variable y defining statement', () => {
            expect(
                sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('y')
                    .definingStatement,
            ).toEqual(sourceFile.statements[1]);
        });

        it('should explain the identifier y on the 3rd line', () => {
            expect(
                sourceFileBindingResolver.explain(
                    ((sourceFile.statements[2] as ExpressionStatement).expression as CallExpression)
                        .arguments[0] as Identifier,
                ),
            ).toEqual(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('y'));
        });
    });

    describe('functions', () => {
        describe('resolve variables to function params', () => {
            const sourceFile = createTsSourceFile(`
        function func(x: string) {
            let y = x + 1;
            console.log(y);
        }
        `);

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);

            let functionBindingResolver = sourceFileBindingResolver.findBindingResolver(
                sourceFile.statements[0],
            );
            let functionBodyBindingResolver = sourceFileBindingResolver.findBindingResolver(
                (sourceFile.statements[0] as FunctionDeclaration).body,
            );

            it('should not resolve function variables in the global scope', () => {
                expect(
                    sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('x'),
                ).toBe(UNKNOWN_VARIABLE);

                expect(
                    sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('y'),
                ).toBe(UNKNOWN_VARIABLE);
            });

            it('should resolve function param x on the function scope', () => {
                expect(functionBindingResolver.getVariable('x')).toEqual({
                    name: 'x',
                    definingStatement: sourceFile.statements[0],
                    root: mkParameterVariableRoot(
                        (sourceFile.statements[0] as FunctionDeclaration).parameters[0],
                        0,
                    ),
                });
            });

            it('should explain the identifier x on the 2nd line to the x in the function scope', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                (sourceFile.statements[0] as FunctionDeclaration).body
                                    .statements[0] as VariableStatement
                            ).declarationList.declarations[0].initializer as BinaryExpression
                        ).left as Identifier,
                    ),
                ).toEqual(functionBindingResolver.getVariable('x'));
            });

            it('should explain the identifier y on the 3rd line to the y in the function body scope', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                (sourceFile.statements[0] as FunctionDeclaration).body
                                    .statements[1] as ExpressionStatement
                            ).expression as CallExpression
                        ).arguments[0] as Identifier,
                    ),
                ).toEqual(functionBodyBindingResolver.getVariable('y'));
            });
        });

        describe('captured variables into a function', () => {
            const sourceFile = createTsSourceFile(`
        let z = 0;
        function func(x: string) {
            let y = z;
            console.log(y + x + 1);
        }
        `);

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
            let rootBindingResolver = sourceFileBindingResolver.findBindingResolver(sourceFile);
            let functionBodyBindingResolver = sourceFileBindingResolver.findBindingResolver(
                (sourceFile.statements[1] as FunctionDeclaration).body,
            );

            it('should not resolve function variables in the global scope', () => {
                expect(rootBindingResolver.getVariable('x')).toBe(UNKNOWN_VARIABLE);

                expect(rootBindingResolver.getVariable('y')).toBe(UNKNOWN_VARIABLE);
            });

            it('should resolve variable z on the root scope', () => {
                expect(rootBindingResolver.getVariable('z')).toEqual({
                    name: 'z',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root: mkLiteralVariableRoot(
                            (sourceFile.statements[0] as VariableStatement).declarationList
                                .declarations[0].initializer,
                        ),
                    },
                    definingStatement: sourceFile.statements[0],
                });
            });

            it('should resolve variable y on the function body scope', () => {
                expect(functionBodyBindingResolver.getVariable('y')).toEqual({
                    name: 'y',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: rootBindingResolver.getVariable('z'),
                    definingStatement: (sourceFile.statements[1] as FunctionDeclaration).body
                        .statements[0],
                });
            });

            it('should explain identifier z on the function 1st line to the global scope z variable', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (sourceFile.statements[1] as FunctionDeclaration).body
                                .statements[0] as VariableStatement
                        ).declarationList.declarations[0].initializer as Identifier,
                    ),
                ).toEqual(rootBindingResolver.getVariable('z'));
            });

            it('should explain identifier y on the function 2nd line to the function body scoped y variable', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                (
                                    (
                                        (sourceFile.statements[1] as FunctionDeclaration).body
                                            .statements[1] as ExpressionStatement
                                    ).expression as CallExpression
                                ).arguments[0] as BinaryExpression
                            ).left as BinaryExpression
                        ).left as Identifier,
                    ),
                ).toEqual(functionBodyBindingResolver.getVariable('y'));
            });
        });

        describe('inline event handler', () => {
            const sourceFile = createTsSourceFile(`
            refs.input.onClick(({ event }) => {
                const inputValue = event.target.value;
                const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                event.target.value = validValue;
            })`);

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);

            let functionBindingResolver = sourceFileBindingResolver.findBindingResolver(
                ((sourceFile.statements[0] as ExpressionStatement).expression as CallExpression)
                    .arguments[0],
            );

            let functionBodyBindingResolver = sourceFileBindingResolver.findBindingResolver(
                (
                    ((sourceFile.statements[0] as ExpressionStatement).expression as CallExpression)
                        .arguments[0] as ArrowFunction
                ).body,
            );

            it('should not resolve function variables in the global scope', () => {
                expect(
                    sourceFileBindingResolver
                        .findBindingResolver(sourceFile)
                        .getVariable('inputValue'),
                ).toBe(UNKNOWN_VARIABLE);

                expect(
                    sourceFileBindingResolver
                        .findBindingResolver(sourceFile)
                        .getVariable('validValue'),
                ).toBe(UNKNOWN_VARIABLE);
            });

            it('should resolve the event variable on the function scope', () => {
                expect(functionBindingResolver.getVariable('event')).toEqual({
                    name: 'event',
                    accessedFrom: {
                        definingStatement: sourceFile.statements[0],
                        root: mkParameterVariableRoot(
                            (
                                (
                                    (sourceFile.statements[0] as ExpressionStatement)
                                        .expression as CallExpression
                                ).arguments[0] as ArrowFunction
                            ).parameters[0],
                            0,
                        ),
                    },
                    accessedByProperty: 'event',
                    definingStatement: sourceFile.statements[0],
                });
            });

            let arrowFunctionBody = (
                ((sourceFile.statements[0] as ExpressionStatement).expression as CallExpression)
                    .arguments[0] as ArrowFunction
            ).body as Block;

            it('should explain the event identifier in the 1st function statement to the event variable', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                (arrowFunctionBody.statements[0] as VariableStatement)
                                    .declarationList.declarations[0]
                                    .initializer as PropertyAccessExpression
                            ).expression as PropertyAccessExpression
                        ).expression as Identifier,
                    ),
                ).toEqual(functionBindingResolver.getVariable('event'));
            });

            it('should explain the inputValue identifier in the 2ns function statement to the inputValue variable', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                (arrowFunctionBody.statements[1] as VariableStatement)
                                    .declarationList.declarations[0].initializer as CallExpression
                            ).expression as PropertyAccessExpression
                        ).expression as Identifier,
                    ),
                ).toEqual(functionBodyBindingResolver.getVariable('inputValue'));
            });

            it('should explain the inputValue identifier in the 3rd function statement to the inputValue variable', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (arrowFunctionBody.statements[2] as ExpressionStatement)
                                .expression as BinaryExpression
                        ).right as Identifier,
                    ),
                ).toEqual(functionBodyBindingResolver.getVariable('validValue'));
            });

            it('should explain the event identifier in the 3rd function statement to the event variable', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                (
                                    (arrowFunctionBody.statements[2] as ExpressionStatement)
                                        .expression as BinaryExpression
                                ).left as PropertyAccessExpression
                            ).expression as PropertyAccessExpression
                        ).expression as Identifier,
                    ),
                ).toEqual(functionBindingResolver.getVariable('event'));
            });
        });
    });

    describe('iterations', () => {
        describe('for iteration', () => {
            const sourceFile = createTsSourceFile(`
        let z = 0;
        for (let i = 0; i < 10; i++) {
            let y = z + i;
            console.log(y);
        }
        `);

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
            let rootBindingResolver = sourceFileBindingResolver.findBindingResolver(sourceFile);
            let forBindingResolver = sourceFileBindingResolver.findBindingResolver(
                sourceFile.statements[1],
            );
            let forBodyBindingResolver = sourceFileBindingResolver.findBindingResolver(
                (sourceFile.statements[1] as ForStatement).statement,
            );

            it('should not resolve for variables in the global scope', () => {
                expect(rootBindingResolver.getVariable('x')).toBe(UNKNOWN_VARIABLE);

                expect(rootBindingResolver.getVariable('y')).toBe(UNKNOWN_VARIABLE);
            });

            it('should resolve the z variable on the root scope', () => {
                expect(rootBindingResolver.getVariable('z')).toEqual({
                    name: 'z',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root: mkLiteralVariableRoot(
                            (sourceFile.statements[0] as VariableStatement).declarationList
                                .declarations[0].initializer,
                        ),
                    },
                    definingStatement: sourceFile.statements[0],
                });
            });

            it('should resolve the i variable on the for scope', () => {
                expect(forBindingResolver.getVariable('i')).toEqual({
                    name: 'i',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root: mkLiteralVariableRoot(
                            (
                                (sourceFile.statements[1] as ForStatement)
                                    .initializer as VariableDeclarationList
                            ).declarations[0].initializer,
                        ),
                    },
                    definingStatement: sourceFile.statements[1],
                });
            });

            it('should resolve the y variable on the for body scope', () => {
                expect(forBodyBindingResolver.getVariable('y')).toEqual({
                    name: 'y',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root: mkOtherVariableRoot(
                            (
                                ((sourceFile.statements[1] as ForStatement).statement as Block)
                                    .statements[0] as VariableStatement
                            ).declarationList.declarations[0].initializer,
                        ),
                    },
                    definingStatement: (
                        (sourceFile.statements[1] as ForStatement).statement as Block
                    ).statements[0],
                });
            });

            it('should explain the z identifier in the 1st for block statement to the root z variable', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                ((sourceFile.statements[1] as ForStatement).statement as Block)
                                    .statements[0] as VariableStatement
                            ).declarationList.declarations[0].initializer as BinaryExpression
                        ).left as Identifier,
                    ),
                ).toEqual(rootBindingResolver.getVariable('z'));
            });

            it('should explain the i identifier in the 1sr for block statement to the for i variable', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                ((sourceFile.statements[1] as ForStatement).statement as Block)
                                    .statements[0] as VariableStatement
                            ).declarationList.declarations[0].initializer as BinaryExpression
                        ).right as Identifier,
                    ),
                ).toEqual(forBindingResolver.getVariable('i'));
            });

            it('should explain the y identifier in the 2nd for block statement to the for block y variable', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                ((sourceFile.statements[1] as ForStatement).statement as Block)
                                    .statements[1] as ExpressionStatement
                            ).expression as CallExpression
                        ).arguments[0] as Identifier,
                    ),
                ).toEqual(forBodyBindingResolver.getVariable('y'));
            });
        });

        describe('for in iteration', () => {
            const sourceFile = createTsSourceFile(`
        let z = [];
        for (let i in z) {
            let y = z + i;
            console.log(y);
        }`);

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
            let rootBindingResolver = sourceFileBindingResolver.findBindingResolver(sourceFile);
            let forBindingResolver = sourceFileBindingResolver.findBindingResolver(
                sourceFile.statements[1],
            );
            let forBodyBindingResolver = sourceFileBindingResolver.findBindingResolver(
                (sourceFile.statements[1] as ForStatement).statement,
            );

            it('should not resolve for variables in the global scope', () => {
                expect(rootBindingResolver.getVariable('x')).toBe(UNKNOWN_VARIABLE);

                expect(rootBindingResolver.getVariable('y')).toBe(UNKNOWN_VARIABLE);
            });

            it('should resolve the z variable on the root scope', () => {
                expect(rootBindingResolver.getVariable('z')).toEqual({
                    name: 'z',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root: mkOtherVariableRoot(
                            (sourceFile.statements[0] as VariableStatement).declarationList
                                .declarations[0].initializer,
                        ),
                    },
                    definingStatement: sourceFile.statements[0],
                });
            });

            it('should resolve the i variable on the for scope', () => {
                expect(forBindingResolver.getVariable('i')).toEqual({
                    name: 'i',
                    definingStatement: sourceFile.statements[1],
                    root: mkOtherVariableRoot(sourceFile.statements[1]),
                });
            });

            it('should not resolve y variable in the for scope', () => {
                expect(forBindingResolver.getVariable('y')).toBe(UNKNOWN_VARIABLE);
            });

            it('should resolve the y variable on the for body scope', () => {
                expect(forBodyBindingResolver.getVariable('y')).toEqual({
                    name: 'y',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root: mkOtherVariableRoot(
                            (
                                ((sourceFile.statements[1] as ForStatement).statement as Block)
                                    .statements[0] as VariableStatement
                            ).declarationList.declarations[0].initializer,
                        ),
                    },
                    definingStatement: (
                        (sourceFile.statements[1] as ForStatement).statement as Block
                    ).statements[0],
                });
            });
        });

        describe('for of iteration', () => {
            const sourceFile = createTsSourceFile(`
        let z = [];
        for (let i of z) {
            let y = z + i;
            console.log(y);
        }`);

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
            let rootBindingResolver = sourceFileBindingResolver.findBindingResolver(sourceFile);
            let forBindingResolver = sourceFileBindingResolver.findBindingResolver(
                sourceFile.statements[1],
            );
            let forBodyBindingResolver = sourceFileBindingResolver.findBindingResolver(
                (sourceFile.statements[1] as ForStatement).statement,
            );

            it('should not resolve for variables in the global scope', () => {
                expect(rootBindingResolver.getVariable('x')).toBe(UNKNOWN_VARIABLE);

                expect(rootBindingResolver.getVariable('y')).toBe(UNKNOWN_VARIABLE);
            });

            it('should resolve the z variable on the root scope', () => {
                expect(rootBindingResolver.getVariable('z')).toEqual({
                    name: 'z',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root: mkOtherVariableRoot(
                            (sourceFile.statements[0] as VariableStatement).declarationList
                                .declarations[0].initializer,
                        ),
                    },
                    definingStatement: sourceFile.statements[0],
                });
            });

            it('should resolve the i variable on the for scope', () => {
                expect(forBindingResolver.getVariable('i')).toEqual({
                    name: 'i',
                    definingStatement: sourceFile.statements[1],
                    root: mkOtherVariableRoot(sourceFile.statements[1]),
                });
            });

            it('should resolve the y variable on the for body scope', () => {
                expect(forBodyBindingResolver.getVariable('y')).toEqual({
                    name: 'y',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root: mkOtherVariableRoot(
                            (
                                ((sourceFile.statements[1] as ForStatement).statement as Block)
                                    .statements[0] as VariableStatement
                            ).declarationList.declarations[0].initializer,
                        ),
                    },
                    definingStatement: (
                        (sourceFile.statements[1] as ForStatement).statement as Block
                    ).statements[0],
                });
            });
        });

        describe('while iteration', () => {
            const sourceFile = createTsSourceFile(`
        let z = 0;
        while(z < 10) {
            let y = z;
            console.log(y);
            z = z + 1
        }
        `);

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
            let rootBindingResolver = sourceFileBindingResolver.findBindingResolver(sourceFile);
            let whileBlockBindingResolver = sourceFileBindingResolver.findBindingResolver(
                (sourceFile.statements[1] as WhileStatement).statement,
            );

            it('should not resolve while block variables in the global scope', () => {
                expect(rootBindingResolver.getVariable('y')).toBe(UNKNOWN_VARIABLE);
            });

            it('should resolve the z variable on the root scope', () => {
                expect(rootBindingResolver.getVariable('z')).toEqual({
                    name: 'z',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: {
                        root: mkLiteralVariableRoot(
                            (sourceFile.statements[0] as VariableStatement).declarationList
                                .declarations[0].initializer,
                        ),
                    },
                    definingStatement: sourceFile.statements[0],
                });
            });

            it('should resolve the y variable on the while body scope', () => {
                expect(whileBlockBindingResolver.getVariable('y')).toEqual({
                    name: 'y',
                    letOrConst: LetOrConst.LET,
                    assignedFrom: rootBindingResolver.getVariable('z'),
                    definingStatement: (
                        (sourceFile.statements[1] as WhileStatement).statement as Block
                    ).statements[0],
                });
            });

            it('should explain the z identifier in the while condition expression to the global scope z', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (sourceFile.statements[1] as WhileStatement)
                                .expression as BinaryExpression
                        ).left as Identifier,
                    ),
                ).toEqual(rootBindingResolver.getVariable('z'));
            });

            it('should explain the z identifier in the while body 1st statement to the global scope z', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            ((sourceFile.statements[1] as WhileStatement).statement as Block)
                                .statements[0] as VariableStatement
                        ).declarationList.declarations[0].initializer as Identifier,
                    ),
                ).toEqual(rootBindingResolver.getVariable('z'));
            });

            it('should explain the y identifier in the while body 2st statement to the while body scope y', () => {
                expect(
                    sourceFileBindingResolver.explain(
                        (
                            (
                                ((sourceFile.statements[1] as WhileStatement).statement as Block)
                                    .statements[1] as ExpressionStatement
                            ).expression as CallExpression
                        ).arguments[0] as Identifier,
                    ),
                ).toEqual(whileBlockBindingResolver.getVariable('y'));
            });
        });
    });

    describe('variable shadowing', () => {
        const sourceFile = createTsSourceFile(`
            let x = 10;
            let y = 'hello';
            {
                let x = 20;
                console.log(y, x);
            }
            console.log(y, x);
            `);

        let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
        let rootBindingResolver = sourceFileBindingResolver.findBindingResolver(sourceFile);
        let blockBindingResolver = sourceFileBindingResolver.findBindingResolver(
            sourceFile.statements[2],
        );

        it('should resolve variable x in root scope', () => {
            expect(rootBindingResolver.getVariable('x').definingStatement).toEqual(
                sourceFile.statements[0],
            );
        });

        it('should resolve variable x in block scope', () => {
            expect(blockBindingResolver.getVariable('x').definingStatement).toEqual(
                (sourceFile.statements[2] as Block).statements[0],
            );
        });

        it('should resolve variable y in root scope', () => {
            expect(rootBindingResolver.getVariable('y').definingStatement).toEqual(
                sourceFile.statements[1],
            );
        });

        it('should not resolve variable y in block scope', () => {
            expect(blockBindingResolver.getVariable('y')).toEqual(UNKNOWN_VARIABLE);
        });

        it('should explain the y identifier in the block console.log(y, x) to the root scope y', () => {
            expect(
                sourceFileBindingResolver.explain(
                    (
                        ((sourceFile.statements[2] as Block).statements[1] as ExpressionStatement)
                            .expression as CallExpression
                    ).arguments[0] as Identifier,
                ),
            ).toEqual(rootBindingResolver.getVariable('y'));
        });

        it('should explain the x identifier in the block console.log(y, x) to the block scope x', () => {
            expect(
                sourceFileBindingResolver.explain(
                    (
                        ((sourceFile.statements[2] as Block).statements[1] as ExpressionStatement)
                            .expression as CallExpression
                    ).arguments[1] as Identifier,
                ),
            ).toEqual(blockBindingResolver.getVariable('x'));
        });

        it('should explain the y identifier in the root console.log(y, x) to the root scope y', () => {
            expect(
                sourceFileBindingResolver.explain(
                    ((sourceFile.statements[3] as ExpressionStatement).expression as CallExpression)
                        .arguments[0] as Identifier,
                ),
            ).toEqual(rootBindingResolver.getVariable('y'));
        });

        it('should explain the x identifier in the root console.log(y, x) to the root scope x', () => {
            expect(
                sourceFileBindingResolver.explain(
                    ((sourceFile.statements[3] as ExpressionStatement).expression as CallExpression)
                        .arguments[1] as Identifier,
                ),
            ).toEqual(rootBindingResolver.getVariable('x'));
        });
    });

    describe('explain type', () => {
        it('should resolve basic param types', () => {
            const sourceFile = createTsSourceFile(`
                function bla(a: string, b: number, c: boolean, d: Date, e: RegExp) {}
                `);
            const bindingResolver = new SourceFileBindingResolver(sourceFile);
            const func = sourceFile.statements[0] as FunctionDeclaration

            expect(bindingResolver.explainType(func.parameters[0].type)).toEqual('string')
            expect(bindingResolver.explainType(func.parameters[1].type)).toEqual('number')
            expect(bindingResolver.explainType(func.parameters[2].type)).toEqual('boolean')
            expect(bindingResolver.explainType(func.parameters[3].type)).toEqual('Date')
            expect(bindingResolver.explainType(func.parameters[4].type)).toEqual('RegExp')
        })

        it('should resolve imported types', () => {
            const sourceFile = createTsSourceFile(`
                import {A} from 'module-a'
                function bla(a: A) {}
                `);
            const bindingResolver = new SourceFileBindingResolver(sourceFile);
            const func = sourceFile.statements[1] as FunctionDeclaration

            expect(bindingResolver.explainType(func.parameters[0].type)).toEqual('module-a.A')
        })

        it('should resolve varargs type', () => {
            const sourceFile = createTsSourceFile(`
                function bla(...a: string[]) {}
                `);
            const bindingResolver = new SourceFileBindingResolver(sourceFile);
            const func = sourceFile.statements[0] as FunctionDeclaration

            expect(bindingResolver.explainType(func.parameters[0].type)).toEqual('Array<string>')
        })

        it('should resolve function type', () => {
            const sourceFile = createTsSourceFile(`
                function bla(a: () => void) {}
                `);
            const bindingResolver = new SourceFileBindingResolver(sourceFile);
            const func = sourceFile.statements[0] as FunctionDeclaration

            expect(bindingResolver.explainType(func.parameters[0].type)).toEqual('() => void')
        })

        it('should resolve function with parameters and return type', () => {
            const sourceFile = createTsSourceFile(`
                import {A, B} from 'module-a'
                function bla(a: (a:A) => B) {}
                `);
            const bindingResolver = new SourceFileBindingResolver(sourceFile);
            const func = sourceFile.statements[1] as FunctionDeclaration

            expect(bindingResolver.explainType(func.parameters[0].type)).toEqual('(module-a.A) => module-a.B')
        })
    })
});
