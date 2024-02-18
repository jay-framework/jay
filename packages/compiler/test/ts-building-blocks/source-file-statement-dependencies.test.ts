import {createTsSourceFile} from "../test-utils/ts-source-utils.ts";
import {astToFormattedCode} from "../test-utils/ts-compiler-test-utils.ts";
import {SourceFileStatementDependencies} from "../../lib/ts-file/building-blocks/source-file-statement-dependencies.ts";
import {SourceFileBindingResolver} from "../../lib/ts-file/building-blocks/source-file-binding-resolver.ts";
import {prettify} from "../../lib";

interface PrintedStatement {
    id: number,
    statement: string,
    dependencies: string
}
async function print(dag: SourceFileStatementDependencies): Promise<Set<PrintedStatement>> {
    let printedStatements = new Set<PrintedStatement>();
    for await (let statementDependencies of dag.getAllStatements()) {
        let dependsOn = [...statementDependencies.dependsOn].map(dependsOn => `this -> ${dependsOn.id}`)
        let dependencyFor = [...statementDependencies.isDependencyFor].map(dependencyFor => `this <- ${dependencyFor.id}`)
        let dependencies = [...dependsOn, ...dependencyFor].sort().join(', ')
        let statement = (await astToFormattedCode(statementDependencies.statement)).trim();
        printedStatements.add({id: statementDependencies.id, statement, dependencies})
    }
    return printedStatements;
}

async function format(code) {
    return (await prettify(code)).trim();
}

describe('statement-DAG', () => {

    describe('support flat statement dependencies', () => {
        it('resolve dependencies of variable assignments', async () => {
            const sourceFile = createTsSourceFile(`
            let x = 10;
            let y = x + 1;
            console.log(y)`);
            let bindingResolver = new SourceFileBindingResolver(sourceFile);
            let statementDependencies = new SourceFileStatementDependencies(sourceFile, bindingResolver);

            expect(await print(statementDependencies)).toEqual(new Set([
                {id: 0, statement: 'let x = 10;', dependencies: 'this <- 1'},
                {id: 1, statement: 'let y = x + 1;', dependencies: 'this -> 0, this <- 2'},
                {id: 2, statement: 'console.log(y);', dependencies: 'this -> 1'}
            ]))
        })

        it('resolve dependencies of multiple variable assignments', async () => {
            const sourceFile = createTsSourceFile(`
            let x = 10;
            let z = 20;
            let y = x + z;
            console.log(x, y)`);
            let bindingResolver = new SourceFileBindingResolver(sourceFile);
            let statementDependencies = new SourceFileStatementDependencies(sourceFile, bindingResolver);

            expect(await print(statementDependencies)).toEqual(new Set([
                {id: 0, statement: 'let x = 10;', dependencies: 'this <- 2, this <- 3'},
                {id: 1, statement: 'let z = 20;', dependencies: 'this <- 2'},
                {id: 2, statement: 'let y = x + z;', dependencies: 'this -> 0, this -> 1, this <- 3'},
                {id: 3, statement: 'console.log(x, y);', dependencies: 'this -> 0, this -> 2'}
            ]))
        })

        it('resolve dependencies between code blocks', async () => {
            const sourceFile = createTsSourceFile(`
            let x = 10;
            {
              let z = 20;
              let y = x + z;
              console.log(x, y)
            }`);
            let bindingResolver = new SourceFileBindingResolver(sourceFile);
            let statementDependencies = new SourceFileStatementDependencies(sourceFile, bindingResolver);

            expect(await print(statementDependencies)).toEqual(new Set([
                {id: 0, statement: 'let x = 10;', dependencies: 'this <- 3, this <- 4'},
                {
                    id: 1,
                    statement: await format(`{
                        let z = 20;
                        let y = x + z;
                        console.log(x, y);
                    }`),
                    dependencies: "",
                },
                {id: 2, statement: 'let z = 20;', dependencies: 'this <- 3'},
                {id: 3, statement: 'let y = x + z;', dependencies: 'this -> 0, this -> 2, this <- 4'},
                {id: 4, statement: 'console.log(x, y);', dependencies: 'this -> 0, this -> 3'}
            ]))
        })

    })

    describe('support import dependencies', () => {

    });

    describe("support function statement dependencies (params to body and in-body dependencies)", () => {

        it('should create DAG for a function declaration', async () => {
            const sourceFile = createTsSourceFile(`function bla ({ event }) {
                const inputValue = event.target.value;
                const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                event.target.value = validValue;
            }`);
            let bindingResolver = new SourceFileBindingResolver(sourceFile);
            let statementDependencies = new SourceFileStatementDependencies(sourceFile, bindingResolver);

            expect(await print(statementDependencies)).toEqual(new Set([
                {
                    id: 0,
                    dependencies: "this <- 1, this <- 3",
                    statement: await format(`function bla({ event }) {
                        const inputValue = event.target.value;
                        const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
                        event.target.value = validValue;
                    }`),
                },
                {
                    id: 1,
                    dependencies: "this -> 0, this <- 2",
                    statement: "const inputValue = event.target.value;",
                },
                {
                    id: 2,
                    dependencies: "this -> 1, this <- 3",
                    statement: "const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');",
                },
                {
                    id: 3,
                    dependencies: "this -> 0, this -> 2",
                    statement: "event.target.value = validValue;",
                },
            ]))
        })

        it('should resolve function arguments', async () => {
            const sourceFile = createTsSourceFile(`
            let x = 10;
            let a = {};
            let z = a.b.c.f(x)`);
            let bindingResolver = new SourceFileBindingResolver(sourceFile);
            let statementDependencies = new SourceFileStatementDependencies(sourceFile, bindingResolver);

            expect(await print(statementDependencies)).toEqual(new Set([
                {id: 0, statement: 'let x = 10;', dependencies: 'this <- 2'},
                {id: 1, statement: 'let a = {};', dependencies: 'this <- 2'},
                {id: 2, statement: 'let z = a.b.c.f(x);', dependencies: 'this -> 0, this -> 1'}
            ]))
        })

    })
});