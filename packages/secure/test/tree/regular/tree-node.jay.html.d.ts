import {JayElement, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {TreeNode, Node} from './tree-node';

export interface TreeNodeViewState {
  headChar: string,
  node: Node,
  open: boolean
}

export interface TreeNodeRefs {
  head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeRefs>

export declare function render(viewState: TreeNodeViewState, options?: RenderElementOptions): TreeNodeElement