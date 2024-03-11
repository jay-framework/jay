import ts from "typescript";

export type ContextualVisitChild<Context> = (node: ts.Node, childContext?: Context) => ts.Node;
export type ContextualVisitor<Context> = (node: ts.Node,
                                          context: Context,
                                          visitChild: ContextualVisitChild<Context>) => ts.Node;

export type ContextualVisitor2<Context> = (node: ts.Node,
                                          context: Context,
                                          visitChild: ContextualVisitChild<Context>,
                                          visitEachChild: ContextualVisitChild<Context>) => ts.Node;

export function visitWithContext<Context>(node: ts.Node, initialContext: Context,
                                          contextualVisitor: ContextualVisitor<Context>) {
    return visitWithContext2(node, initialContext, undefined, contextualVisitor)
}

export function visitWithContext2<Context>(node: ts.Node, initialContext: Context,
                                          transformationContext: ts.TransformationContext,
                                          contextualVisitor: ContextualVisitor2<Context>) {

    let contexts: Context[] = [initialContext];
    const visitChild = (node: ts.Node, childContext?: Context) => {
        if (childContext)
            contexts.push(childContext);
        let visitedNode = ts.visitNode(node, visitor);
        if (childContext)
            contexts.pop();
        return visitedNode;
    }

    const visitEachChild = (node: ts.Node, childContext?: Context) => {
        if (childContext)
            contexts.push(childContext);
        let visitedNode = ts.visitEachChild(node, visitor, transformationContext);
        if (childContext)
            contexts.pop();
        return visitedNode;
    }
    const visitor = (node: ts.Node): ts.Node => {
        return contextualVisitor(node, contexts.at(-1), visitChild, visitEachChild)
    }
    return ts.visitNode(node, visitor);
}