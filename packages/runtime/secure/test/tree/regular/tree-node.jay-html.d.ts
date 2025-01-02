import {
    JayElement,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
    MapEventEmitterViewState,
    ComponentCollectionProxy,
    OnlyEventEmitters,
} from 'jay-runtime';
import { TreeNode, Node } from './tree-node';

export interface TreeNodeViewState {
    headChar: string;
    node: Node;
    open: boolean;
}

export type TreeNodeRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof TreeNode>>;
export type TreeNodeRefs<ParentVS> = ComponentCollectionProxy<ParentVS, TreeNodeRef<ParentVS>> &
    OnlyEventEmitters<TreeNodeRef<ParentVS>>;
export interface TreeNodeElementRefs {
    head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>;
    child: TreeNodeRefs<Node>;
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeElementRefs>;
export type TreeNodeElementRender = RenderElement<
    TreeNodeViewState,
    TreeNodeElementRefs,
    TreeNodeElement
>;
export type TreeNodeElementPreRender = [TreeNodeElementRefs, TreeNodeElementRender];

export declare function render(options?: RenderElementOptions): TreeNodeElementPreRender;
