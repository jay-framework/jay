import ts, {
    isIdentifier,
    isStatement,
    SourceFile,
    Statement
} from "typescript";
import {SourceFileBindingResolver} from "./source-file-binding-resolver.ts";

export interface StatementDependencies {
    id: number,
    parent?: Statement;
    statement: Statement;
    dependsOn: Set<StatementDependencies>,
    isDependencyFor: Set<StatementDependencies>,
}


export class SourceFileStatementDependencies {
    private statementDependencies = new Map<ts.Node, StatementDependencies>();

    constructor(sourceFile: SourceFile, bindingResolver: SourceFileBindingResolver) {
        let parents: StatementDependencies[] = []
        let id = 0;
        const visitor = (node: ts.Node): ts.Node =>  {
            if (isStatement(node)) {
                const statementDependencies = {
                    statement: node,
                    parent: parents.at(-1)?.statement,
                    isDependencyFor: new Set<StatementDependencies>(),
                    dependsOn: new Set<StatementDependencies>(),
                    id: id++
                };
                this.statementDependencies.set(node, statementDependencies)
                parents.push(statementDependencies);
            }
            if (isIdentifier(node)) {
                let variable = bindingResolver.explain(node);
                let thisStatementDependencies = parents.at(-1);
                if (variable.definingStatement && variable.definingStatement !== thisStatementDependencies.statement) {
                    let dependsOnStatementDependencies = this.statementDependencies.get(variable.definingStatement);
                    thisStatementDependencies.dependsOn.add(dependsOnStatementDependencies);
                    dependsOnStatementDependencies.isDependencyFor.add(thisStatementDependencies);

                }
            }

            node.getChildren().forEach(child =>
                ts.visitNode(child, visitor))

            if (isStatement(node))
                parents.pop();
            return node;
        }
        ts.visitNode(sourceFile, visitor)
    }

    getDependsOn(statement: Statement) {
        return this.statementDependencies.get(statement).dependsOn;
    }

    getIsDependencyFor(statement: Statement) {
        return this.statementDependencies.get(statement).isDependencyFor;
    }

    getAllStatements() {
        return this.statementDependencies.values();
    }

    getStatementDependencies(statement: Statement) {
        return this.statementDependencies.get(statement);
    }
}
