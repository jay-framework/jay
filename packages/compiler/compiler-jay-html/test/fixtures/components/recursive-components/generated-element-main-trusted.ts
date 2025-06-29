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
    OnlyEventEmitters,
    ComponentCollectionProxy,
    JayContract,
} from '@jay-framework/runtime';
import { TreeNode, Node } from './tree-node';

export type TreeNodeRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof TreeNode>>;
export type TreeNodeRefs<ParentVS> = ComponentCollectionProxy<ParentVS, TreeNodeRef<ParentVS>> &
    OnlyEventEmitters<TreeNodeRef<ParentVS>>;

export interface RecursiveComponentsElementRefs {
    children: {
        counter1: TreeNodeRefs<Node>;
        counterTwo: TreeNodeRefs<Node>;
    };
}

export type RecursiveComponentsElement = JayElement<Node, RecursiveComponentsElementRefs>;
export type RecursiveComponentsElementRender = RenderElement<
    Node,
    RecursiveComponentsElementRefs,
    RecursiveComponentsElement
>;
export type RecursiveComponentsElementPreRender = [
    RecursiveComponentsElementRefs,
    RecursiveComponentsElementRender,
];
export type RecursiveComponentsContract = JayContract<Node, RecursiveComponentsElementRefs>;

export function render(options?: RenderElementOptions): RecursiveComponentsElementPreRender {
    const [childrenRefManager, [refCounter1, refCounterTwo]] = ReferencesManager.for(
        options,
        [],
        [],
        [],
        ['counter1', 'counterTwo'],
    );
    const [refManager, [refAR1]] = ReferencesManager.for(options, [], [], ['aR1'], [], {
        children: childrenRefManager,
    });
    const render = (viewState: Node) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => vs.name)]),
                childComp(TreeNode, (vs: Node) => vs.firstChild, refAR1()),
                de('ul', {}, [
                    forEach(
                        (vs: Node) => vs.children,
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
                        (vs: Node) => vs.children,
                        (vs1: Node) => {
                            return e('li', {}, [
                                childComp(TreeNode, (vs1: Node) => vs1, refCounterTwo()),
                            ]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as RecursiveComponentsElement;
    return [refManager.getPublicAPI() as RecursiveComponentsElementRefs, render];
}
