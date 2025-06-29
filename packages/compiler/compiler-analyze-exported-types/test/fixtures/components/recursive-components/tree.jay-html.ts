import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    childComp,
    RenderElementOptions,
    MapEventEmitterViewState,
    ComponentCollectionProxy,
    OnlyEventEmitters,
} from '@jay-framework/runtime';
import { TreeNode, Node } from './tree-node';

export type TreeNodeRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof TreeNode>>;
export type TreeNodeRefs<ParentVS> = ComponentCollectionProxy<ParentVS, TreeNodeRef<ParentVS>> &
    OnlyEventEmitters<TreeNodeRef<ParentVS>>;
export interface TreeElementRefs {
    counter1: TreeNodeRefs<Node>;
    counterTwo: TreeNodeRefs<Node>;
}

export type TreeElement = JayElement<Node, TreeElementRefs>;
export type TreeElementRender = RenderElement<Node, TreeElementRefs, TreeElement>;
export type TreeElementPreRender = [TreeElementRefs, TreeElementRender];

export function render(options?: RenderElementOptions): TreeElementPreRender {
    const [refManager, [refAR1, refCounter1, refCounterTwo]] = ReferencesManager.for(
        options,
        [],
        [],
        ['aR1'],
        ['counter1', 'counterTwo'],
    );
    const render = (viewState: Node) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => vs.name)]),
                childComp(TreeNode, (vs: Node) => vs.firstChild, refAR1()),
                de('ul', {}, [
                    forEach(
                        (vs) => vs.children,
                        (vs1: Node) => {
                            return e('li', {}, [
                                childComp(
                                    TreeNode,
                                    (vs1: Node) => ({
                                        name: vs1.name,
                                        id: vs1.id,
                                        children: vs1.children,
                                    }),
                                    refCounter1(),
                                ),
                            ]);
                        },
                        'id',
                    ),
                    forEach(
                        (vs) => vs.children,
                        (vs1: Node) => {
                            return e('li', {}, [
                                childComp(TreeNode, (vs1: Node) => vs1, refCounterTwo()),
                            ]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as TreeElement;
    return [refManager.getPublicAPI() as TreeElementRefs, render];
}
