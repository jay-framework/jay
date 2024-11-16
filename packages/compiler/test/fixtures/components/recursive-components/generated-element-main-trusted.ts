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
} from 'jay-runtime';
// @ts-expect-error Cannot find module
import { TreeNodeRefs } from './tree-node-refs';
import { TreeNode, Node } from './tree-node';

export interface RecursiveComponentsElementRefs {
    counter1: TreeNodeRefs<Node>;
    counterTwo: TreeNodeRefs<Node>;
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

export function render(options?: RenderElementOptions): RecursiveComponentsElementPreRender {
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
                                    (vs: Node) => ({
                                        name: vs.name,
                                        id: vs.id,
                                        children: vs.children,
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
                                childComp(TreeNode, (vs: Node) => vs, refCounterTwo()),
                            ]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as RecursiveComponentsElement;
    return [refManager.getPublicAPI() as RecursiveComponentsElementRefs, render];
}
