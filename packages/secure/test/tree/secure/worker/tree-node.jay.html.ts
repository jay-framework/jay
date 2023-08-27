import {HTMLElementProxy, JayElement} from "jay-runtime";
import {Node, TreeNode} from "./tree-node";
import {compCollectionRef, elementBridge, elemRef} from "../../../../lib";
import {sandboxElement as e, sandboxForEach as forEach, sandboxChildComp as childComp} from "../../../../lib/";

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
    return elementBridge(viewState, () => {
            const refChild = compCollectionRef('child')
            return [
                e(elemRef('head')),
                forEach((viewState: TreeNodeViewState) => viewState.node?.children, 'id', () => [
                    childComp(TreeNode, vs => vs, refChild())
                    ]
                )
            ]
        },
        [],
        [''],
        [[['node', 'children'], {matchBy: 'id'}]]) as unknown as TreeNodeElement;
}