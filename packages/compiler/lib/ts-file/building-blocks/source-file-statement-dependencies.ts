import ts, {
    Block,
    isBlock,
    isIdentifier,
    isIfStatement, isPropertyAccessChain, isPropertyAccessExpression,
    isSourceFile, isStatement,
    isVariableStatement, Node, NodeArray,
    SourceFile,
    Statement
} from "typescript";
import {NameBindingResolver} from "./name-binding-resolver";
import {SourceFileBindingResolver} from "./source-file-binding-resolver.ts";

// export class DAGStatement {
//     constructor(
//         public readonly id: string,
//         public readonly statement: Statement | SourceFile,
//         public readonly childDAGs: Map<ts.Node, DAG>,
//         public readonly dependsOn: DAGStatement[],
//         public readonly isDependencyFor: DAGStatement[],
//     ) {}
// }
//
// export class DAG extends DAGStatement { //todo DAG is not a statement, but a node.
//     constructor(
//         id: string, // todo remove
//         statement: Statement | SourceFile, // todo change to node
//         childDAGs: Map<ts.Node, DAG>, // todo remove
//         dependsOn: DAGStatement[], // todo remove
//         isDependencyFor: DAGStatement[], // todo remove
//         public readonly nameBindingResolver: NameBindingResolver,
//         public readonly childStatements: DAGStatement[]
//     ) {
//         super(id, statement, childDAGs, dependsOn, isDependencyFor)
//     }
// }
//
// // isSafe is on expression
// // DAG is on statements
//
// function id(parentId: string, index: number) {
//     if (parentId)
//         return `${parentId}.${index}`;
//     else
//         return `${index}`;
// }
//
// function findIdentifierDependencies(statement: Statement, nameBindingResolver: NameBindingResolver): string[] {
//     let dependencies = [];
//     let visitorNode = (node: ts.Node) => {
//         if (isStatement(node))
//             return node;
//         if (isPropertyAccessExpression(node))
//             visitorNode(node.expression);
//         else if (isIdentifier(node)) {
//             if (nameBindingResolver.getVariable(node.text))
//                 dependencies.push(node.text);
//         }
//         else
//             node.getChildren().forEach(childNode => ts.visitNode(childNode, visitorNode))
//         return node;
//     }
//
//     statement.getChildren().forEach(childNode => ts.visitNode(childNode, visitorNode))
//     return dependencies;
// }
//
// function resolveDAGStatementDependencies(dependsOnNames: string[], astToDag: Map<ts.Statement, DAGStatement>, nameBindingResolver: NameBindingResolver, thisStatement: ts.Statement): DAGStatement[] {
//     return dependsOnNames
//         .map(dependsOnName => nameBindingResolver.getVariable(dependsOnName))
//         .filter(variable => !!variable.name && variable.definingStatement !== thisStatement)
//         .map(variable => astToDag.get(variable.definingStatement))
// }
//
// export function createDAG(blockOrFile: Block | SourceFile, parentId: string = ''): DAG {
//     let nameBindingResolver = new NameBindingResolver();
//     let astToDag = new Map<Statement, DAGStatement>();
//     let childStatements =
//         blockOrFile.statements.map((thisStatement, index) => {
//             let childDAGs = new Map<ts.Node, DAG>();
//             if (isVariableStatement(thisStatement))
//                 nameBindingResolver.addVariableStatement(thisStatement);
//             let dependsOnNames = findIdentifierDependencies(thisStatement, nameBindingResolver);
//             let dependsOn = resolveDAGStatementDependencies(dependsOnNames, astToDag, nameBindingResolver, thisStatement);
//
//             const dagStatement = new DAGStatement(id(parentId, index), thisStatement, childDAGs, dependsOn, []);
//             dependsOn.forEach(dependsOnStatement => dependsOnStatement.isDependencyFor.push(dagStatement));
//             astToDag.set(thisStatement, dagStatement);
//             return dagStatement;
//         });
//     return new DAG(parentId, blockOrFile, childDAGs, [], [], nameBindingResolver, childStatements);
// }

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
