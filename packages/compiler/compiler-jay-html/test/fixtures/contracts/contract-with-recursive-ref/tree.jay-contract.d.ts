import {JayContract, HTMLElementProxy, HTMLElementCollectionProxy} from '@jay-framework/runtime';

export interface TreeViewState {
    name: string;
    id: string;
    open: boolean;
    children: TreeViewState[];
}

export type TreeSlowViewState = Pick<TreeViewState, 'name' | 'id' | 'children'>;
export type TreeFastViewState = Pick<TreeViewState, 'open'>;
export type TreeInteractiveViewState = Pick<TreeViewState, 'open'>;

export interface TreeRefs {
    nodeHeader: HTMLElementProxy<TreeViewState, HTMLDivElement>;
}

export interface TreeRepeatedRefs {
    nodeHeader: HTMLElementCollectionProxy<TreeViewState, HTMLDivElement>;
}

export type TreeContract = JayContract<
    TreeViewState,
    TreeRefs,
    TreeSlowViewState,
    TreeFastViewState,
    TreeInteractiveViewState
>;

