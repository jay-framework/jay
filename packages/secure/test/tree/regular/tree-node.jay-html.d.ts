import { JayElement, HTMLElementProxy, RenderElementOptions } from 'jay-runtime';
import { TreeNodeRefs } from './tree-node-refs';
import { TreeNode, Node } from './tree-node';

export interface TreeNodeViewState {
    headChar: string;
    node: Node;
    open: boolean;
}

export interface TreeNodeElementRefs {
    head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>;
    child: TreeNodeRefs<Node>;
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeElementRefs>;

export declare function render(
    viewState: TreeNodeViewState,
    options?: RenderElementOptions,
): TreeNodeElement;
