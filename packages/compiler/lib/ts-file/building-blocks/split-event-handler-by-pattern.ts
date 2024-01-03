import ts, {Expression, ExpressionStatement, isCallExpression, isPropertyAccessExpression} from "typescript";
import {FlattenedAccessChain, flattenVariable, NameBindingResolver} from "./name-binding-resolver.ts";
import {CompiledPattern} from "./compile-function-split-patterns.ts";
import {astToCode, codeToAst} from "../ts-compiler-utils.ts";

function findPatternInVariable(resolvedParam: FlattenedAccessChain, paramIndex: number, compiledPatterns: CompiledPattern[]) {
    return compiledPatterns.find(pattern =>
        (paramIndex === pattern.paramIndex &&
            pattern.accessChain.path.length <= resolvedParam.path.length &&
            pattern.accessChain.path.every((element, index) => element = resolvedParam.path[index]))
    )
}

const transformEventHandlerStatement =
    (nameBindingResolver: NameBindingResolver, compiledPatterns: CompiledPattern[], context: ts.TransformationContext, factory: ts.NodeFactory) => (node) => {
        if (isCallExpression(node)) {
            let newArguments: Expression[] = node.arguments.map((argument, paramIndex) => {
                if (isPropertyAccessExpression(argument)) {
                    let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(argument);
                    let flattenedResolvedParam = flattenVariable(resolvedParam);
                    let patternMatch = findPatternInVariable(flattenedResolvedParam, paramIndex, compiledPatterns);
                    let replacementPattern = ['event.$1', ...flattenedResolvedParam.path.splice(patternMatch.accessChain.path.length)];
                    return (codeToAst(replacementPattern.join('.'), context)[0] as ExpressionStatement).expression
                }
                else
                    return argument;
            })
            return factory.createCallExpression(node.expression, undefined, newArguments)
        }
        return node;
    }

export const splitEventHandlerByPatternBlock =
    (context: ts.TransformationContext, compiledPatterns: CompiledPattern[], factory: ts.NodeFactory) => (eventHandler: ts.FunctionLikeDeclarationBase) => {

    let eventHandlerNameResolver = new NameBindingResolver();
    eventHandlerNameResolver.addFunctionParams(eventHandler);

    return ts.visitEachChild(eventHandler, transformEventHandlerStatement(eventHandlerNameResolver, compiledPatterns, context, factory), context)
}