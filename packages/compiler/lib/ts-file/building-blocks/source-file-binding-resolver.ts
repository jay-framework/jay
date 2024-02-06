import ts, {
    Identifier, isForStatement, isFunctionDeclaration, isImportDeclaration, isVariableDeclarationList,
    isVariableStatement,
    SourceFile,
} from "typescript";
import {
    NameBindingResolver,
} from "./name-binding-resolver.ts";
import {isFunctionLikeDeclarationBase} from "../ts-compiler-utils.ts";

export class SourceFileBindingResolver {
    private nameBindingResolvers = new Map<ts.Node, NameBindingResolver>();

    constructor(sourceFile: SourceFile) {
        this.nameBindingResolvers.set(sourceFile, new NameBindingResolver())
        const nbResolversQueue: Array<NameBindingResolver> = [this.nameBindingResolvers.get(sourceFile)]
        const visitor = (node: ts.Node): ts.Node =>  {
            if (isVariableStatement(node))
                nbResolversQueue[0].addVariableStatement(node)
            if (isImportDeclaration(node))
                nbResolversQueue[0].addImportDeclaration(node)
            if (isFunctionDeclaration(node))
                nbResolversQueue[0].addFunctionDeclaration(node)
            if (isFunctionLikeDeclarationBase(node)) {
                nbResolversQueue.unshift(new NameBindingResolver(nbResolversQueue[0]));
                this.nameBindingResolvers.set(node, nbResolversQueue[0])
                nbResolversQueue[0].addFunctionParams(node)
                node.getChildren().forEach(child =>
                    ts.visitNode(child, visitor))
                nbResolversQueue.shift();
                return node;
            }
            if (isForStatement(node) && isVariableDeclarationList(node.initializer)) {
                nbResolversQueue.unshift(new NameBindingResolver(nbResolversQueue[0]));
                this.nameBindingResolvers.set(node, nbResolversQueue[0])
                nbResolversQueue[0].addVariableDeclarationList(node.initializer)
                node.getChildren().forEach(child =>
                    ts.visitNode(child, visitor))
                nbResolversQueue.shift();
                return node;
            }
            node.getChildren().forEach(child =>
                ts.visitNode(child, visitor))
            return node;
        }
        ts.visitNode(sourceFile, visitor)
    }

    findBindingResolver(node: ts.Node): NameBindingResolver {
        let found: NameBindingResolver;
        while (!(found = this.nameBindingResolvers.get(node)))
            node = node.parent;
        return found;
    }

    explain(identifier: Identifier) {
        return this.findBindingResolver(identifier).getVariable(identifier.text);
    }
}
