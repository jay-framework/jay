import {createTsSourceFile} from "../test-utils/ts-source-utils.ts";
import {
    BinaryExpression, Block,
    CallExpression, ExpressionStatement, ForStatement, FunctionDeclaration,
    Identifier, VariableDeclarationList,
    VariableStatement
} from "typescript";
import {
    mkOtherVariableRoot,
    mkParameterVariableRoot,
    UNKNOWN_VARIABLE,
} from "../../lib/ts-file/building-blocks/name-binding-resolver.ts";
import {SourceFileBindingResolver} from "../../lib/ts-file/building-blocks/source-file-binding-resolver.ts";

describe('SourceFileBindingResolver', () => {

    it('should resolve variables', () => {
        const sourceFile = createTsSourceFile(`
            let x = 10;
            let y = x + 1;
            console.log(y)`);

        let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);

        expect(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('x').definingStatement)
            .toEqual(sourceFile.statements[0])

        expect(sourceFileBindingResolver.explain(
            ((sourceFile.statements[1] as VariableStatement)
                .declarationList.declarations[0]
                .initializer as BinaryExpression)
                .left as Identifier))
            .toEqual(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('x'));

        expect(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('y').definingStatement)
            .toEqual(sourceFile.statements[1])

        expect(sourceFileBindingResolver.explain(
            ((sourceFile.statements[2] as ExpressionStatement)
                .expression as CallExpression)
                .arguments[0] as Identifier))
            .toEqual(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('y'));
    })

    it('should resolve imported variables', () => {
        const sourceFile = createTsSourceFile(`
            import x from 'bla';
            let y = x + 1;
            console.log(y)`);

        let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);

        expect(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('x').definingStatement)
            .toEqual(sourceFile.statements[0])

        expect(sourceFileBindingResolver.explain(
            ((sourceFile.statements[1] as VariableStatement)
                .declarationList.declarations[0]
                .initializer as BinaryExpression)
                .left as Identifier))
            .toEqual(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('x'));

        expect(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('y').definingStatement)
            .toEqual(sourceFile.statements[1])

        expect(sourceFileBindingResolver.explain(
            ((sourceFile.statements[2] as ExpressionStatement)
                .expression as CallExpression)
                .arguments[0] as Identifier))
            .toEqual(sourceFileBindingResolver.findBindingResolver(sourceFile).getVariable('y'));
    })

    it('should resolve variables to function params', () => {
        const sourceFile = createTsSourceFile(`
        function func(x: string) {
            let y = x + 1;
            console.log(y);
        }
        `)

        let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);

        expect(sourceFileBindingResolver
            .findBindingResolver(sourceFile).getVariable('x'))
            .toBe(UNKNOWN_VARIABLE);

        expect(sourceFileBindingResolver
            .findBindingResolver(sourceFile).getVariable('y'))
            .toBe(UNKNOWN_VARIABLE);

        let functionBindingResolver = sourceFileBindingResolver
            .findBindingResolver(sourceFile.statements[0]);

        expect(functionBindingResolver
            .getVariable('x'))
            .toEqual({
                name: 'x',
                definingStatement: sourceFile.statements[0],
                root: mkParameterVariableRoot(((sourceFile.statements[0] as FunctionDeclaration)
                    .parameters[0]), 0)
            })

        expect(sourceFileBindingResolver.explain(
            (((sourceFile.statements[0] as FunctionDeclaration)
                .body.statements[0] as VariableStatement)
                .declarationList
                .declarations[0]
                .initializer as BinaryExpression)
                .left as Identifier))
            .toEqual(functionBindingResolver.getVariable('x'));

        expect(sourceFileBindingResolver.explain(
            (((sourceFile.statements[0] as FunctionDeclaration)
                .body.statements[1] as ExpressionStatement)
                .expression as CallExpression)
                .arguments[0] as Identifier))
            .toEqual(functionBindingResolver.getVariable('y'));
    })

    it('should resolve captured variables into a function', () => {
        const sourceFile = createTsSourceFile(`
        let z = 0;
        function func(x: string) {
            let y = z;
            console.log(y + x + 1);
        }
        `)

        let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
        let rootBindingResolver = sourceFileBindingResolver
            .findBindingResolver(sourceFile);
        let functionBindingResolver = sourceFileBindingResolver
            .findBindingResolver(sourceFile.statements[1]);

        expect(rootBindingResolver.getVariable('x'))
            .toBe(UNKNOWN_VARIABLE);

        expect(rootBindingResolver.getVariable('y'))
            .toBe(UNKNOWN_VARIABLE);

        expect(rootBindingResolver.getVariable('z'))
            .toEqual({
                name: 'z',
                assignedFrom: {
                    root: mkOtherVariableRoot((sourceFile
                        .statements[0] as VariableStatement)
                        .declarationList.declarations[0].initializer
                    )
                },
                definingStatement: sourceFile.statements[0],
            });


        expect(functionBindingResolver.getVariable('y'))
            .toEqual({
                name: 'y',
                assignedFrom: rootBindingResolver.getVariable('z'),
                definingStatement: (sourceFile
                    .statements[1] as FunctionDeclaration)
                    .body
                    .statements[0]
            });

        expect(sourceFileBindingResolver.explain(
            ((sourceFile.statements[1] as FunctionDeclaration)
                .body
                .statements[0] as VariableStatement)
                .declarationList.declarations[0]
                .initializer as Identifier))
            .toEqual(rootBindingResolver.getVariable('z'));

        expect(sourceFileBindingResolver.explain(
            (((((sourceFile.statements[1] as FunctionDeclaration)
                .body
                .statements[1] as ExpressionStatement)
                .expression as CallExpression)
                .arguments[0] as BinaryExpression)
                .left as BinaryExpression)
                .left as Identifier))
            .toEqual(functionBindingResolver.getVariable('y'));

    })

    describe('iterations', () => {
        it('for iteration', () => {
            const sourceFile = createTsSourceFile(`
        let z = 0;
        for (let i = 0; i < 10; i++) {
            let y = z + i;
            console.log(y);
        }
        `)

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
            let rootBindingResolver = sourceFileBindingResolver
                .findBindingResolver(sourceFile);
            let forBindingResolver = sourceFileBindingResolver
                .findBindingResolver(sourceFile.statements[1]);

            expect(rootBindingResolver.getVariable('x'))
                .toBe(UNKNOWN_VARIABLE);

            expect(rootBindingResolver.getVariable('y'))
                .toBe(UNKNOWN_VARIABLE);

            expect(rootBindingResolver.getVariable('z'))
                .toEqual({
                    name: 'z',
                    assignedFrom: {
                        root: mkOtherVariableRoot((sourceFile
                            .statements[0] as VariableStatement)
                            .declarationList.declarations[0].initializer
                        )
                    },
                    definingStatement: sourceFile.statements[0],
                });


            expect(forBindingResolver.getVariable('i'))
                .toEqual({
                    name: 'i',
                    assignedFrom: {
                        root: mkOtherVariableRoot(((sourceFile
                            .statements[1] as ForStatement)
                            .initializer as VariableDeclarationList)
                            .declarations[0].initializer),
                    },
                    definingStatement: sourceFile.statements[1]
                });
            expect(forBindingResolver.getVariable('y'))
                .toEqual({
                    name: 'y',
                    assignedFrom: {
                        root: mkOtherVariableRoot((((sourceFile
                            .statements[1] as ForStatement)
                            .statement as Block)
                            .statements[0] as VariableStatement)
                            .declarationList.declarations[0].initializer
                        )
                    },
                    definingStatement: ((sourceFile
                        .statements[1] as ForStatement)
                        .statement as Block)
                        .statements[0]
                });
        })

        it('for in iteration', () => {
            const sourceFile = createTsSourceFile(`
        let z = [];
        for (let i in z) {
            let y = z + i;
            console.log(y);
        }`)

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
            let rootBindingResolver = sourceFileBindingResolver
                .findBindingResolver(sourceFile);
            let forBindingResolver = sourceFileBindingResolver
                .findBindingResolver(sourceFile.statements[1]);

            expect(rootBindingResolver.getVariable('x'))
                .toBe(UNKNOWN_VARIABLE);

            expect(rootBindingResolver.getVariable('y'))
                .toBe(UNKNOWN_VARIABLE);

            expect(rootBindingResolver.getVariable('z'))
                .toEqual({
                    name: 'z',
                    assignedFrom: {
                        root: mkOtherVariableRoot((sourceFile
                            .statements[0] as VariableStatement)
                            .declarationList.declarations[0].initializer
                        )
                    },
                    definingStatement: sourceFile.statements[0],
                });


            expect(forBindingResolver.getVariable('i'))
                .toEqual({
                    name: 'i',
                    definingStatement: sourceFile.statements[1],
                    root: mkOtherVariableRoot(sourceFile.statements[1]),
                });

            expect(forBindingResolver.getVariable('y'))
                .toEqual({
                    name: 'y',
                    assignedFrom: {
                        root: mkOtherVariableRoot((((sourceFile
                            .statements[1] as ForStatement)
                            .statement as Block)
                            .statements[0] as VariableStatement)
                            .declarationList.declarations[0].initializer
                        )
                    },
                    definingStatement: ((sourceFile
                        .statements[1] as ForStatement)
                        .statement as Block)
                        .statements[0]
                });
        })

        it('for of iteration', () => {
            const sourceFile = createTsSourceFile(`
        let z = [];
        for (let i of z) {
            let y = z + i;
            console.log(y);
        }`)

            let sourceFileBindingResolver = new SourceFileBindingResolver(sourceFile);
            let rootBindingResolver = sourceFileBindingResolver
                .findBindingResolver(sourceFile);
            let forBindingResolver = sourceFileBindingResolver
                .findBindingResolver(sourceFile.statements[1]);

            expect(rootBindingResolver.getVariable('x'))
                .toBe(UNKNOWN_VARIABLE);

            expect(rootBindingResolver.getVariable('y'))
                .toBe(UNKNOWN_VARIABLE);

            expect(rootBindingResolver.getVariable('z'))
                .toEqual({
                    name: 'z',
                    assignedFrom: {
                        root: mkOtherVariableRoot((sourceFile
                            .statements[0] as VariableStatement)
                            .declarationList.declarations[0].initializer
                        )
                    },
                    definingStatement: sourceFile.statements[0],
                });


            expect(forBindingResolver.getVariable('i'))
                .toEqual({
                    name: 'i',
                    definingStatement: sourceFile.statements[1],
                    root: mkOtherVariableRoot(sourceFile.statements[1]),
                });

            expect(forBindingResolver.getVariable('y'))
                .toEqual({
                    name: 'y',
                    assignedFrom: {
                        root: mkOtherVariableRoot((((sourceFile
                            .statements[1] as ForStatement)
                            .statement as Block)
                            .statements[0] as VariableStatement)
                            .declarationList.declarations[0].initializer
                        )
                    },
                    definingStatement: ((sourceFile
                        .statements[1] as ForStatement)
                        .statement as Block)
                        .statements[0]
                });
        })
    })

})
