import {
    BaseJayElement,
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    withData,
    dynamicElement as de,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface TreeOfWithDataAtRootViewState {
    value: number;
    id: string;
    hasLeft: boolean;
    hasRight: boolean;
    left: TreeOfWithDataAtRootViewState | null;
    right: TreeOfWithDataAtRootViewState | null;
}

export interface WithDataAtRootViewState {
    tree: TreeOfWithDataAtRootViewState;
}

export interface WithDataAtRootElementRefs {
    tree: {
        treeNode: HTMLElementProxy<TreeOfWithDataAtRootViewState, HTMLDivElement>;
    };
}

export type WithDataAtRootElement = JayElement<WithDataAtRootViewState, WithDataAtRootElementRefs>;
export type WithDataAtRootElementRender = RenderElement<
    WithDataAtRootViewState,
    WithDataAtRootElementRefs,
    WithDataAtRootElement
>;
export type WithDataAtRootElementPreRender = [
    WithDataAtRootElementRefs,
    WithDataAtRootElementRender,
];
export type WithDataAtRootContract = JayContract<
    WithDataAtRootViewState,
    WithDataAtRootElementRefs
>;

export function render(options?: RenderElementOptions): WithDataAtRootElementPreRender {
    const [treeRefManager, [refTreeNode]] = ReferencesManager.for(
        options,
        ['treeNode'],
        [],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        tree: treeRefManager,
    });

    function renderRecursiveRegion_treeNode(): BaseJayElement<TreeOfWithDataAtRootViewState> {
        return e(
            'div',
            { class: 'tree-node' },
            [
                e('div', { class: 'node-value' }, [dt((vs1) => vs1.value)]),
                de('div', { class: 'children' }, [
                    c(
                        (vs1) => vs1.hasLeft,
                        () =>
                            de('div', { class: 'left-child' }, [
                                withData(
                                    (vs1) => vs1.left,
                                    () => renderRecursiveRegion_treeNode(),
                                ),
                            ]),
                    ),
                    c(
                        (vs1) => vs1.hasRight,
                        () =>
                            de('div', { class: 'right-child' }, [
                                withData(
                                    (vs1) => vs1.right,
                                    () => renderRecursiveRegion_treeNode(),
                                ),
                            ]),
                    ),
                ]),
            ],
            refTreeNode(),
        );
    }

    const render = (viewState: WithDataAtRootViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                withData(
                    (vs: WithDataAtRootViewState) => vs.tree,
                    () => renderRecursiveRegion_treeNode(),
                ),
            ]),
        ) as WithDataAtRootElement;
    return [refManager.getPublicAPI() as WithDataAtRootElementRefs, render];
}
