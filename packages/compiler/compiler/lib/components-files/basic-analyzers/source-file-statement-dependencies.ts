import { SourceFileBindingResolver } from './source-file-binding-resolver';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { isIdentifier, isStatement, visitNode } = tsModule;

export interface StatementDependencies {
    id: number;
    parent?: ts.Statement;
    statement: ts.Statement;
    dependsOn: Set<StatementDependencies>;
    isDependencyFor: Set<StatementDependencies>;
}

export class SourceFileStatementDependencies {
    private statementDependencies = new Map<ts.Node, StatementDependencies>();

    constructor(sourceFile: ts.SourceFile, bindingResolver: SourceFileBindingResolver) {
        let parents: StatementDependencies[] = [];
        let id = 0;
        const visitor = (node: ts.Node): ts.Node => {
            if (isStatement(node)) {
                const statementDependencies = {
                    statement: node as ts.Statement,
                    parent: parents.at(-1)?.statement,
                    isDependencyFor: new Set<StatementDependencies>(),
                    dependsOn: new Set<StatementDependencies>(),
                    id: id++,
                };
                this.statementDependencies.set(node, statementDependencies);
                parents.push(statementDependencies);
            }
            if (isIdentifier(node)) {
                let variable = bindingResolver.explain(node);
                let thisStatementDependencies = parents.at(-1);
                if (
                    variable.definingStatement &&
                    variable.definingStatement !== thisStatementDependencies.statement
                ) {
                    let dependsOnStatementDependencies = this.statementDependencies.get(
                        variable.definingStatement,
                    );
                    thisStatementDependencies.dependsOn.add(dependsOnStatementDependencies);
                    dependsOnStatementDependencies.isDependencyFor.add(thisStatementDependencies);
                }
            }

            node.getChildren().forEach((child) => visitNode(child, visitor));

            if (isStatement(node)) parents.pop();
            return node;
        };
        visitNode(sourceFile, visitor);
    }

    getDependsOn(statement: ts.Statement) {
        return this.statementDependencies.get(statement).dependsOn;
    }

    getIsDependencyFor(statement: ts.Statement) {
        return this.statementDependencies.get(statement).isDependencyFor;
    }

    getAllStatements() {
        return this.statementDependencies.values();
    }

    getStatementDependencies(statement: ts.Statement) {
        return this.statementDependencies.get(statement);
    }
}
