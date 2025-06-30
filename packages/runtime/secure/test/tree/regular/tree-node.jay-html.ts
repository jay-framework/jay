import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementProxy,
    childComp,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
    MapEventEmitterViewState,
    ComponentCollectionProxy,
    OnlyEventEmitters,
} from '@jay-framework/runtime';
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

export function render(options?: RenderElementOptions): TreeNodeElementPreRender {
    const [refManager, [head, child]] = ReferencesManager.for(options, ['head'], [], [], ['child']);
    const render = (viewState: TreeNodeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return de('div', {}, [
                e(
                    'div',
                    { 'data-ref': da((vs) => `head=${vs.node?.id}`) },
                    [
                        e('span', { class: 'tree-arrow' }, [dt((vs) => vs.headChar)]),
                        e('span', { class: 'name' }, [dt((vs) => vs.node?.name)]),
                    ],
                    head(),
                ),
                c(
                    (vs) => vs.open,
                    () =>
                        de('ul', { 'data-ref': da((vs) => `list=${vs.node?.id}`) }, [
                            forEach(
                                (vs) => vs.node?.children,
                                (vs1: Node) => {
                                    return e('li', {}, [
                                        childComp(TreeNode, (vs: Node) => vs, child()),
                                    ]);
                                },
                                'id',
                            ),
                        ]),
                ),
            ]);
        }) as TreeNodeElement;
    return [refManager.getPublicAPI() as TreeNodeElementRefs, render];
}
