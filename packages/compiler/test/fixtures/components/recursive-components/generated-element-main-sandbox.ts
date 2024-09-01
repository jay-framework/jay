import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';
import { secureChildComp } from 'jay-secure';
// @ts-expect-error Cannot find module
import { TreeNodeRefs } from './tree-node-refs';
// @ts-expect-error Cannot find module
import { TreeNode, Node } from './tree-node?jay-mainSandbox';

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
    refs: RecursiveComponentsElementRefs,
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
                secureChildComp(TreeNode, (vs: Node) => vs.firstChild, refAR1()),
                de('ul', {}, [
                    forEach(
                        (vs) => vs.children,
                        (vs1: Node) => {
                            return e('li', {}, [
                                secureChildComp(
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
                                secureChildComp(TreeNode, (vs: Node) => vs, refCounterTwo()),
                            ]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as RecursiveComponentsElement;
    return [refManager.getPublicAPI() as RecursiveComponentsElementRefs, render];
}
