import {
    ConstructContext,
    RenderElementOptions,
    ReferencesManager,
    JayElement,
    RenderElement,
} from 'jay-runtime';
import { mainRoot as mr } from '../../../../lib/';
import { secureChildComp } from '../../../../lib/';
import { TreeNode, Node } from './tree-node';
import { TreeNodeComponentType } from './tree-node-refs';

export interface AppElementRefs {
    comp1: TreeNodeComponentType<Node>;
}

export type AppElement = JayElement<Node, AppElementRefs>;
type AppElementRender = RenderElement<Node, AppElementRefs, AppElement>;
type AppElementPreRender = [refs: AppElementRefs, AppElementRender];

export function preRender(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1]] = ReferencesManager.for(options, [], [], ['comp1'], []);
    const render = (viewState: Node) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return mr(viewState, () => secureChildComp(TreeNode, (vs) => vs, comp1()));
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
