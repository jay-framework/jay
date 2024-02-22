import ts, {
    Identifier,
    isBlock,
    isForInStatement,
    isForOfStatement,
    isForStatement,
    isFunctionDeclaration,
    isIdentifier,
    isImportDeclaration,
    isStringLiteral,
    isTypeReferenceNode,
    isVariableDeclarationList,
    isVariableStatement, PropertyAccessExpression,
    SourceFile,
    SyntaxKind,
    VariableDeclarationList,
} from "typescript";
import {
    flattenVariable,
    isImportModuleVariableRoot,
    mkOtherVariableRoot,
    mkVariable,
    NameBindingResolver,
} from "./name-binding-resolver.ts";
import {isFunctionLikeDeclarationBase} from "../ts-compiler-utils.ts";

const BUILT_IN_TYPES = ['RegExp'];
function builtInType(text: string) {
    return BUILT_IN_TYPES.findIndex(_ => _ === text) > -1;
}

export class SourceFileBindingResolver {
    private nameBindingResolvers = new Map<ts.Node, NameBindingResolver>();

    constructor(sourceFile: SourceFile) {
        this.nameBindingResolvers.set(sourceFile, new NameBindingResolver())
        const nbResolversQueue: Array<NameBindingResolver> = [this.nameBindingResolvers.get(sourceFile)]

        const doWithChildBindingResolver = (node: ts.Node, callback: () => void) => {
            nbResolversQueue.unshift(new NameBindingResolver(nbResolversQueue[0]));
            this.nameBindingResolvers.set(node, nbResolversQueue[0])
            callback();
            node.getChildren().forEach(child =>
                ts.visitNode(child, visitor))
            nbResolversQueue.shift();
            return node;
        }

        const visitor = (node: ts.Node): ts.Node =>  {
            if (isFunctionDeclaration(node))
                nbResolversQueue[0].addFunctionDeclaration(node)

            if (isVariableStatement(node))
                nbResolversQueue[0].addVariableStatement(node)
            else if (isImportDeclaration(node))
                nbResolversQueue[0].addImportDeclaration(node)
            else if (isBlock(node))
                return doWithChildBindingResolver(node,
                    () => {})
            else if (isFunctionLikeDeclarationBase(node)) {
                return doWithChildBindingResolver(node,
                    () => nbResolversQueue[0].addFunctionParams(node))
            }
            else if (isForStatement(node) && isVariableDeclarationList(node.initializer)) {
                return doWithChildBindingResolver(node,
                    () => nbResolversQueue[0].addVariableDeclarationList(node.initializer as VariableDeclarationList))
            }
            else if ((isForInStatement(node) || isForOfStatement(node)) &&
                isVariableDeclarationList(node.initializer) &&
                node.initializer.declarations.length === 1 &&
                isIdentifier(node.initializer.declarations[0].name)
            ) {
                return doWithChildBindingResolver(node,
                    () => {
                        let name = ((node.initializer as VariableDeclarationList).declarations[0].name as Identifier).text;
                        nbResolversQueue[0].addVariable(name, mkVariable({
                            name,
                            root: mkOtherVariableRoot(node),
                            definingStatement: node
                        }))
                    })
            }
            node.getChildren().forEach(child =>
                ts.visitNode(child, visitor))
            return node;
        }
        ts.visitNode(sourceFile, visitor)
    }

    findBindingResolver(node: ts.Node): NameBindingResolver {
        let found: NameBindingResolver;
        while (!(found = this.nameBindingResolvers.get(node)) && node.parent)
            node = node.parent;
        return found;
    }

    explain(identifier: Identifier | PropertyAccessExpression) {
        return this.findBindingResolver(identifier).resolvePropertyAccessChain(identifier);
    }

    explainType(type: ts.TypeNode): string {
        if (type) {
            if (isTypeReferenceNode(type)) {
                let typeName = type.typeName;
                if (isIdentifier(typeName)) {
                    let resolved = this.findBindingResolver(typeName).resolveIdentifier(typeName)
                    let flattened = flattenVariable(resolved);
                    if (!!flattened.root) {
                        if (isImportModuleVariableRoot(flattened.root) && isStringLiteral(flattened.root.module)) {
                            return `${flattened.root.module.text}.${flattened.path.join('.')}`;
                        }
                    }
                    else if (builtInType(typeName.text))
                        return typeName.text
                }
            }
            else if (type.kind === SyntaxKind.StringKeyword)
                return 'string'
        }

        return undefined;
    }
}
