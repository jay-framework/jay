import ts, {isCallExpression, isPropertyAccessExpression} from "typescript";
import {flattenVariable, NameBindingResolver} from "./name-binding-resolver.ts";
import {CompiledPattern} from "./compile-function-split-patterns.ts";

const transformEventHandlerStatement: (nameBindingResolver: NameBindingResolver) => ts.Visitor =
    (nameBindingResolver: NameBindingResolver) => (node) => {
        if (isCallExpression(node)) {
            node.arguments.forEach(argument => {
                if (isPropertyAccessExpression(argument)) {
                    let resolvedParam = nameBindingResolver.resolvePropertyAccessChain(argument);
                    console.log(flattenVariable(resolvedParam));
                }
            })

        }
        return node;
    }

export const splitEventHandlerByPatternBlock: (context: ts.TransformationContext, compiledPatterns: CompiledPattern[]) => ts.Visitor =
    (context: ts.TransformationContext) => (eventHandler: ts.FunctionLikeDeclarationBase) => {

    let nameBindingResolver = new NameBindingResolver();
    nameBindingResolver.addFunctionParams(eventHandler);

    return ts.visitEachChild(eventHandler, transformEventHandlerStatement(nameBindingResolver), context)
}