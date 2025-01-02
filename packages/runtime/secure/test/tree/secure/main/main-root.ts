import {
    ConstructContext,
    RenderElementOptions,
    ReferencesManager,
    JayElement,
    RenderElement, MapEventEmitterViewState, ComponentCollectionProxy, OnlyEventEmitters,
} from 'jay-runtime';
import { mainRoot as mr } from '../../../../lib/';
import { secureChildComp } from '../../../../lib/';
import { TreeNode, Node } from './tree-node';

export type TreeNodeRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof TreeNode>>;
export type TreeNodeRefs<ParentVS> = ComponentCollectionProxy<ParentVS, TreeNodeRef<ParentVS>> &
    OnlyEventEmitters<TreeNodeRef<ParentVS>>;
export interface AppElementRefs {
    comp1: TreeNodeRef<Node>;
}

export type AppElement = JayElement<Node, AppElementRefs>;
type AppElementRender = RenderElement<Node, AppElementRefs, AppElement>;
type AppElementPreRender = [AppElementRefs, AppElementRender];

export function preRender(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1]] = ReferencesManager.for(options, [], [], ['comp1'], []);
    const render = (viewState: Node) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return mr(viewState, () => secureChildComp(TreeNode, (vs) => vs, comp1()));
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
