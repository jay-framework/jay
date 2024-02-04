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

export class DAGStatement {
    constructor(
        public readonly id: string,
        public readonly statement: Statement | SourceFile,
        public readonly dependsOn: DAGStatement[],
        public readonly isDependencyFor: DAGStatement[],
    ) {}
}

export class DAG extends DAGStatement {
    constructor(
        id: string,
        statement: Statement | SourceFile,
        dependsOn: DAGStatement[],
        isDependencyFor: DAGStatement[],
        public readonly nameBindingResolver: NameBindingResolver,
        public readonly childStatements: DAGStatement[]
    ) {
        super(id, statement, dependsOn, isDependencyFor)
    }
}

// isSafe is on expression
// DAG is on statements

function id(parentId: string, index: number) {
    if (parentId)
        return `${parentId}.${index}`;
    else
        return `${index}`;
}

function findIdentifierDependencies(statement: Statement, nameBindingResolver: NameBindingResolver): string[] {
    let dependencies = [];
    let visitorNode = (node: ts.Node) => {
        if (isStatement(node))
            return node;
        if (isPropertyAccessExpression(node))
            visitorNode(node.expression);
        else if (isIdentifier(node)) {
            if (nameBindingResolver.getVariable(node.text))
                dependencies.push(node.text);
        }
        else
            node.getChildren().forEach(childNode => ts.visitNode(childNode, visitorNode))
        return node;
    }

    statement.getChildren().forEach(childNode => ts.visitNode(childNode, visitorNode))
    return dependencies;
}

function resolveDAGStatementDependencies(dependsOnNames: string[], astToDag: Map<ts.Statement, DAGStatement>, nameBindingResolver: NameBindingResolver, thisStatement: ts.Statement): DAGStatement[] {
    return dependsOnNames
        .map(dependsOnName => nameBindingResolver.getVariable(dependsOnName))
        .filter(variable => !!variable.name && variable.definingStatement !== thisStatement)
        .map(variable => astToDag.get(variable.definingStatement))
}

export function createDAG(blockOrFile: Block | SourceFile, parentId: string = ''): DAG {
    let nameBindingResolver = new NameBindingResolver();
    let astToDag = new Map<Statement, DAGStatement>();
    let childStatements =
        blockOrFile.statements.map((thisStatement, index) => {
            if (isVariableStatement(thisStatement))
                nameBindingResolver.addVariableStatement(thisStatement);
            let dependsOnNames = findIdentifierDependencies(thisStatement, nameBindingResolver);
            let dependsOn = resolveDAGStatementDependencies(dependsOnNames, astToDag, nameBindingResolver, thisStatement);

            const dagStatement = new DAGStatement(id(parentId, index), thisStatement, dependsOn, []);
            dependsOn.forEach(dependsOnStatement => dependsOnStatement.isDependencyFor.push(dagStatement));
            astToDag.set(thisStatement, dagStatement);
            return dagStatement;
        });
    return new DAG(parentId, blockOrFile, [], [], nameBindingResolver, childStatements);
    // }
    // else if (isIfStatement(statement)) {
    //     statement.thenStatement
    // }
    // else if (isVariableStatement(statement)) {
    //     nameBindingResolver.addVariableStatement(statement);
    //     return new DAGStatement(statement, [], []);
    // }
    // else
    //     return new DAGStatement(statement, [], []);
}
