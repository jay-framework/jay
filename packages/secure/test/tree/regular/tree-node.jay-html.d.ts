import {JayElement, HTMLElementProxy, RenderElementOptions, RenderElement} from 'jay-runtime';
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
export type TreeNodeElementRender = RenderElement<TreeNodeViewState, TreeNodeElementRefs, TreeNodeElement>
export type TreeNodeElementPreRender = [refs: TreeNodeElementRefs, TreeNodeElementRender]

export declare function render(
    options?: RenderElementOptions,
): TreeNodeElementPreRender;
