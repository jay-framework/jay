import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface TreeViewState {
    name: string;
    id: string;
    open: boolean;
    children: Array<TreeViewState>;
}

export interface TreeElementRefs {
    nodeHeader: HTMLElementProxy<TreeViewState, HTMLDivElement>;
    treeNode: HTMLElementProxy<TreeViewState, HTMLDivElement>;
}

export type TreeSlowViewState = Pick<TreeViewState, 'name' | 'id' | 'children'>;

export type TreeFastViewState = Pick<TreeViewState, 'open'>;

export type TreeInteractiveViewState = Pick<TreeViewState, 'open'>;

export type TreeElement = JayElement<TreeViewState, TreeElementRefs>;
export type TreeElementRender = RenderElement<TreeViewState, TreeElementRefs, TreeElement>;
export type TreeElementPreRender = [TreeElementRefs, TreeElementRender];
export type TreeContract = JayContract<
    TreeViewState,
    TreeElementRefs,
    TreeSlowViewState,
    TreeFastViewState,
    TreeInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): TreeElementPreRender;

