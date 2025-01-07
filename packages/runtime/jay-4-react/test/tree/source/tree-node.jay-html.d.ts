import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
} from 'jay-runtime';
import { TreeNode, Node } from './tree-node';

export interface TreeNodeViewState {
    headChar: string;
    node: Node;
    open: boolean;
}

export interface TreeNodeElementRefs {
    head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>;
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeElementRefs>;
export type TreeNodeElementRender = RenderElement<
    TreeNodeViewState,
    TreeNodeElementRefs,
    TreeNodeElement
>;
export type TreeNodeElementPreRender = [TreeNodeElementRefs, TreeNodeElementRender];

export declare function render(options?: RenderElementOptions): TreeNodeElementPreRender