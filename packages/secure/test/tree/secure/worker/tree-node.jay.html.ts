import {HTMLElementProxy, JayElement} from "jay-runtime";
import {Node, TreeNode} from "./tree-node";
import {elementBridge} from "../../../../lib/sandbox/sandbox-bridge";
import {sandboxElement as e, sandboxForEach as forEach, sandboxChildComp as childComp} from "../../../../lib/sandbox/sandbox-element";

export interface TreeNodeViewState {
    headChar: string,
    node: Node,
    open: boolean
}

export interface TreeNodeElementRefs {
    head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeElementRefs>

export function render(viewState: TreeNodeViewState): TreeNodeElement {
    return elementBridge(viewState, () => [
        e('head'),
        forEach((viewState: TreeNodeViewState) => viewState.node?.children, 'id', () => [
                childComp(TreeNode, vs => vs, "child")
            ]
        )
    ], ['child']) as unknown as TreeNodeElement;
}