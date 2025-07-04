import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementProxy,
    childComp,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import { TreeNode, Node } from './tree-node';

export interface TreeNodeViewState {
    headChar: string;
    node: Node;
    open: boolean;
}

export interface TreeNodeElementRefs {
    head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>;
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeElementRefs>;
export type TreeNodeElementRender = RenderElement<
    TreeNodeViewState,
    TreeNodeElementRefs,
    TreeNodeElement
>;
export type TreeNodeElementPreRender = [TreeNodeElementRefs, TreeNodeElementRender];
export type TreeNodeContract = JayContract<TreeNodeViewState, TreeNodeElementRefs>;

export function render(options?: RenderElementOptions): TreeNodeElementPreRender {
    const [childrenRefManager, [refAR1]] = ReferencesManager.for(options, [], [], [], ['aR1']);
    const [nodeRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        children: childrenRefManager,
    });
    const [refManager, [refHead]] = ReferencesManager.for(options, ['head'], [], [], [], {
        node: nodeRefManager,
    });
    const render = (viewState: TreeNodeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e(
                    'div',
                    {},
                    [
                        e('span', { class: 'tree-arrow' }, [dt((vs) => vs.headChar)]),
                        e('span', {}, [dt((vs) => vs.node?.name)]),
                    ],
                    refHead(),
                ),
                c(
                    (vs) => vs.open,
                    () =>
                        de('ul', {}, [
                            forEach(
                                (vs: TreeNodeViewState) => vs.node?.children,
                                (vs1: Node) => {
                                    return e('li', {}, [
                                        childComp(TreeNode, (vs1: Node) => vs1, refAR1()),
                                    ]);
                                },
                                'id',
                            ),
                        ]),
                ),
            ]),
        ) as TreeNodeElement;
    return [refManager.getPublicAPI() as TreeNodeElementRefs, render];
}
