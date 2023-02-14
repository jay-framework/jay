import {ConstructContext, JayElement } from "jay-runtime";
import {Node, TreeNode} from "./tree-node";
import {bridge, childCompWorker, forEachWorker, withWorkerRootContext} from "../../../lib/element.old";

export interface TreeNodeViewState {
    headChar: string,
    node: Node,
    open: boolean
}

export interface TreeNodeRefs {
    head: HTMLDivElement
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeRefs>

export function render(viewState: TreeNodeViewState): TreeNodeElement {
    return ConstructContext.withRootContext(viewState, () =>
        withWorkerRootContext(() =>
            bridge([
                forEachWorker(1, vs => vs.node.children, (vs1: Node) => {
                    return bridge( [
                        childCompWorker(2, TreeNode, vs => vs)
                    ])}, 'id')
            ]))
    )
}