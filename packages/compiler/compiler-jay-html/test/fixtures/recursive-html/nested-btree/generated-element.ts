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

export interface BtreeOfNestedBtreeViewState {
    value: number;
    id: string;
    hasLeft: boolean;
    hasRight: boolean;
    left: BtreeOfNestedBtreeViewState | null;
    right: BtreeOfNestedBtreeViewState | null;
}

export interface NestedBtreeViewState {
    title: string;
    description: string;
    btree: BtreeOfNestedBtreeViewState;
}

export interface NestedBtreeElementRefs {
    btree: {
        treeNode: HTMLElementProxy<BtreeOfNestedBtreeViewState, HTMLDivElement>;
    };
}

export type NestedBtreeSlowViewState = {};
export type NestedBtreeFastViewState = {};
export type NestedBtreeInteractiveViewState = NestedBtreeViewState;

export type NestedBtreeElement = JayElement<NestedBtreeViewState, NestedBtreeElementRefs>;
export type NestedBtreeElementRender = RenderElement<
    NestedBtreeViewState,
    NestedBtreeElementRefs,
    NestedBtreeElement
>;
export type NestedBtreeElementPreRender = [NestedBtreeElementRefs, NestedBtreeElementRender];
export type NestedBtreeContract = JayContract<
    NestedBtreeViewState,
    NestedBtreeElementRefs,
    NestedBtreeSlowViewState,
    NestedBtreeFastViewState,
    NestedBtreeInteractiveViewState
>;

export function render(options?: RenderElementOptions): NestedBtreeElementPreRender {
    const [btreeRefManager, [refTreeNode]] = ReferencesManager.for(
        options,
        ['treeNode'],
        [],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        btree: btreeRefManager,
    });

    function renderRecursiveRegion_treeNode(): BaseJayElement<BtreeOfNestedBtreeViewState> {
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

    const render = (viewState: NestedBtreeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', { class: 'tree-container' }, [
                e('h1', {}, [dt((vs) => vs.title)]),
                e('p', { class: 'description' }, [dt((vs) => vs.description)]),
                withData(
                    (vs: NestedBtreeViewState) => vs.btree,
                    () => renderRecursiveRegion_treeNode(),
                ),
            ]),
        ) as NestedBtreeElement;
    return [refManager.getPublicAPI() as NestedBtreeElementRefs, render];
}
