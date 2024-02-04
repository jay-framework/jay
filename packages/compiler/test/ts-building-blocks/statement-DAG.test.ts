import {createTsSourceFile} from "../test-utils/ts-source-utils.ts";
import {DAG, createDAG} from "../../lib/ts-file/building-blocks/statements-DAG.ts";
import {astToFormattedCode} from "../test-utils/ts-compiler-test-utils.ts";

async function print(dag: DAG): Promise<any> {
    let printedStatements = await Promise.all(dag.childStatements.map(async dagStatement => {
        if (dagStatement instanceof DAG)
            return print(dagStatement);
        else {
            let dependsOn = dagStatement.dependsOn.map(dependsOn => `this -> ${dependsOn.id}`)
            let dependencyFor = dagStatement.isDependencyFor.map(dependencyFor => `this <- ${dependencyFor.id}`)
            let dependencies = [...dependsOn, ...dependencyFor].join(', ')
            let statement = (await astToFormattedCode(dagStatement.statement)).trim();
            return { statement, dependencies }
        }
    }))
    return printedStatements;
}

describe('statement-DAG', () => {

    it('should create DAG for line by line dependencies', async () => {
        const sourceFile = createTsSourceFile(`
            let x = 10;
            let y = x + 1;
            console.log(y)`);
        let dag = createDAG(sourceFile);

        expect(await print(dag)).toEqual([
            {statement: 'let x = 10;', dependencies: 'this <- 1'},
            {statement: 'let y = x + 1;', dependencies: 'this -> 0, this <- 2'},
            {statement: 'console.log(y);', dependencies: 'this -> 1'}
        ])
    })

    it('should create DAG for line by line dependencies', async () => {
        const sourceFile = createTsSourceFile(`
            let x = 10;
            let z = 20;
            let y = x + z;
            console.log(x, y)`);
        let dag = createDAG(sourceFile);

        expect(await print(dag)).toEqual([
            {statement: 'let x = 10;', dependencies: 'this <- 2, this <- 3'},
            {statement: 'let z = 20;', dependencies: 'this <- 2'},
            {statement: 'let y = x + z;', dependencies: 'this -> 0, this -> 1, this <- 3'},
            {statement: 'console.log(x, y);', dependencies: 'this -> 0, this -> 2'}
        ])
    })
});