import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { visitNode, isArrayTypeNode, isBlock, isForInStatement, isForOfStatement, isForStatement, isFunctionDeclaration, isFunctionTypeNode, isIdentifier, isImportDeclaration, isStringLiteral, isTypeReferenceNode, isUnionTypeNode, isVariableDeclarationList, isVariableStatement, SyntaxKind, } = tsModule;
import {
    FlattenedAccessChain,
    flattenVariable,
    GlobalVariableRoot,
    isImportModuleVariableRoot,
    mkOtherVariableRoot,
    mkVariable,
    NameBindingResolver,
} from './name-binding-resolver';
import { isFunctionLikeDeclarationBase } from '../ts-utils/ts-compiler-utils';
import { byAnd } from './typescript-extras';

const BUILT_IN_TYPES = ['RegExp', 'Date'];
function builtInType(text: string) {
    return BUILT_IN_TYPES.findIndex((_) => _ === text) > -1;
}

export interface ResolvedType {
    canBeAssignedFrom(rightSide: ResolvedType);
}
export class BuiltInResolvedType implements ResolvedType {
    constructor(public readonly name: string) {}

    canBeAssignedFrom(rightSide: ResolvedType) {
        return rightSide instanceof BuiltInResolvedType && this.name === rightSide.name;
    }
}
export class ImportFromModuleResolvedType implements ResolvedType {
    constructor(
        public readonly module: string,
        public readonly path: string[],
    ) {}

    canBeAssignedFrom(rightSide: ResolvedType) {
        if (rightSide instanceof ImportFromModuleResolvedType) {
            let pathEqual = this.path.length === rightSide.path.length;
            if (pathEqual) {
                pathEqual = this.path
                    .map((value, index) => value === rightSide.path[index])
                    .reduce(byAnd(), true);
            }
            return pathEqual && this.module === rightSide.module;
        }
        return false;
    }
}
export class ArrayResolvedType implements ResolvedType {
    constructor(public readonly itemType: ResolvedType) {}

    canBeAssignedFrom(rightSide: ResolvedType) {
        return rightSide instanceof ArrayResolvedType && this.itemType === rightSide.itemType;
    }
}
export class FunctionResolvedType implements ResolvedType {
    constructor(
        public readonly params: ResolvedType[],
        public readonly returns: ResolvedType,
    ) {}

    canBeAssignedFrom(rightSide: ResolvedType) {
        return (
            rightSide instanceof FunctionResolvedType &&
            this.returns.canBeAssignedFrom(rightSide.returns)
        );
    }
}
export class UnionResolvedType implements ResolvedType {
    constructor(public readonly types: ResolvedType[]) {}

    canBeAssignedFrom(rightSide: ResolvedType) {
        if (rightSide instanceof UnionResolvedType) {
            for (const item1 of this.types)
                for (const item2 of rightSide.types)
                    if (item1.canBeAssignedFrom(item2)) return true;
        } else for (const item1 of this.types) if (item1.canBeAssignedFrom(rightSide)) return true;

        return false;
    }
}
export class GlobalResolvedType implements ResolvedType {
    constructor(public readonly name: string) {}

    canBeAssignedFrom(rightSide: ResolvedType) {
        return rightSide instanceof GlobalResolvedType && this.name === rightSide.name;
    }
}
export class SpreadResolvedType implements ResolvedType {
    constructor(public readonly arrayType: ResolvedType) {}

    canBeAssignedFrom(rightSide: ResolvedType) {
        return (
            rightSide instanceof SpreadResolvedType &&
            this.arrayType.canBeAssignedFrom(rightSide.arrayType)
        );
    }
}

export class SourceFileBindingResolver {
    private nameBindingResolvers = new Map<ts.Node, NameBindingResolver>();

    constructor(sourceFile: ts.SourceFile) {
        this.nameBindingResolvers.set(sourceFile, new NameBindingResolver());
        const nbResolversQueue: Array<NameBindingResolver> = [
            this.nameBindingResolvers.get(sourceFile),
        ];

        const doWithChildBindingResolver = (node: ts.Node, callback: () => void) => {
            nbResolversQueue.unshift(new NameBindingResolver(nbResolversQueue[0]));
            this.nameBindingResolvers.set(node, nbResolversQueue[0]);
            callback();
            node.getChildren().forEach((child) => visitNode(child, visitor));
            nbResolversQueue.shift();
            return node;
        };

        const visitor = (node: ts.Node): ts.Node => {
            if (isFunctionDeclaration(node)) nbResolversQueue[0].addFunctionDeclaration(node);

            if (isVariableStatement(node)) nbResolversQueue[0].addVariableStatement(node);
            else if (isImportDeclaration(node)) nbResolversQueue[0].addImportDeclaration(node);
            else if (isBlock(node)) return doWithChildBindingResolver(node, () => {});
            else if (isFunctionLikeDeclarationBase(node)) {
                return doWithChildBindingResolver(node, () =>
                    nbResolversQueue[0].addFunctionParams(node),
                );
            } else if (isForStatement(node) && isVariableDeclarationList(node.initializer)) {
                return doWithChildBindingResolver(node, () =>
                    nbResolversQueue[0].addVariableDeclarationList(
                        node.initializer as ts.VariableDeclarationList,
                    ),
                );
            } else if (
                (isForInStatement(node) || isForOfStatement(node)) &&
                isVariableDeclarationList(node.initializer) &&
                node.initializer.declarations.length === 1 &&
                isIdentifier(node.initializer.declarations[0].name)
            ) {
                return doWithChildBindingResolver(node, () => {
                    let name = (
                        (node.initializer as ts.VariableDeclarationList).declarations[0]
                            .name as ts.Identifier
                    ).text;
                    nbResolversQueue[0].addVariable(
                        name,
                        mkVariable({
                            name,
                            root: mkOtherVariableRoot(node),
                            definingStatement: node,
                        }),
                    );
                });
            }
            node.getChildren().forEach((child) => visitNode(child, visitor));
            return node;
        };
        visitNode(sourceFile, visitor);
    }

    findBindingResolver(node: ts.Node): NameBindingResolver {
        let found: NameBindingResolver;
        while (!(found = this.nameBindingResolvers.get(node)) && node.parent) node = node.parent;
        return found;
    }

    explain(identifier: ts.Identifier | ts.PropertyAccessExpression) {
        return this.findBindingResolver(identifier).resolvePropertyAccessChain(identifier);
    }

    explainFlattenedVariableType(flattened: FlattenedAccessChain): ResolvedType {
        if (!!flattened.root) {
            if (
                isImportModuleVariableRoot(flattened.root) &&
                isStringLiteral(flattened.root.module)
            ) {
                return new ImportFromModuleResolvedType(flattened.root.module.text, flattened.path);
            }
        } else return undefined;
    }

    explainType(type: ts.TypeNode): ResolvedType {
        if (type) {
            if (isTypeReferenceNode(type)) {
                let typeName = type.typeName;
                if (isIdentifier(typeName)) {
                    let resolved = this.findBindingResolver(typeName).resolveIdentifier(typeName);
                    let flattened = flattenVariable(resolved);
                    let typeFromFlattened = this.explainFlattenedVariableType(flattened);
                    if (typeFromFlattened) return typeFromFlattened;
                    if (builtInType(typeName.text)) return new BuiltInResolvedType(typeName.text);
                }
            } else if (type.kind === SyntaxKind.StringKeyword)
                return new BuiltInResolvedType('string');
            else if (type.kind === SyntaxKind.NumberKeyword)
                return new BuiltInResolvedType('number');
            else if (type.kind === SyntaxKind.BooleanKeyword)
                return new BuiltInResolvedType('boolean');
            else if (type.kind === SyntaxKind.AnyKeyword) return new BuiltInResolvedType('any');
            else if (type.kind === SyntaxKind.VoidKeyword) return new BuiltInResolvedType('void');
            else if (isArrayTypeNode(type))
                return new ArrayResolvedType(this.explainType(type.elementType));
            else if (isFunctionTypeNode(type)) {
                const params = type.parameters.map((param) => this.explainType(param.type));
                const ret = this.explainType(type.type);
                return new FunctionResolvedType(params, ret);
            } else if (isUnionTypeNode(type))
                return new UnionResolvedType(type.types.map((aType) => this.explainType(aType)));
        }

        return new BuiltInResolvedType('void');
    }

    globalType(globalVariableRoot: GlobalVariableRoot): ResolvedType {
        return new GlobalResolvedType(globalVariableRoot.name);
    }
}

export function areResolvedTypesCompatible(type1: ResolvedType, type2: ResolvedType): boolean {
    return type1.canBeAssignedFrom(type2);
}
