import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract, BaseJayElement,
} from '@jay-framework/runtime';

export interface BinaryTreeViewState {
    value: number;
    id: string;
    hasLeft: boolean;
    hasRight: boolean;
    left: BinaryTreeViewState | null;
    right: BinaryTreeViewState | null;
}

export interface BinaryTreeElementRefs {
    nodeValue: HTMLElementProxy<BinaryTreeViewState, HTMLDivElement>;
    treeNode: HTMLElementProxy<BinaryTreeViewState, HTMLDivElement>;
}

export type BinaryTreeElement = JayElement<BinaryTreeViewState, BinaryTreeElementRefs>;
export type BinaryTreeElementRender = RenderElement<
    BinaryTreeViewState,
    BinaryTreeElementRefs,
    BinaryTreeElement
>;
export type BinaryTreeElementPreRender = [BinaryTreeElementRefs, BinaryTreeElementRender];
export type BinaryTreeContract = JayContract<BinaryTreeViewState, BinaryTreeElementRefs>;

export function render(options?: RenderElementOptions): BinaryTreeElementPreRender {
    const [refManager, [refNodeValue, refTreeNode]] = ReferencesManager.for(
        options,
        ['nodeValue', 'treeNode'],
        [],
        [],
        [],
    );

    function renderRecursiveRegion_treeNode(): BaseJayElement<BinaryTreeViewState> {
        return e(
            'div',
            { class: 'tree-node' },
            [
                e('div', { class: 'node-value' }, [dt((vs) => ` ${vs.value} `)], refNodeValue()),
                de('div', { class: 'children' }, [
                    c(
                        (vs) => vs.hasLeft,
                        () =>
                            e('div', { class: 'left-child' }, [
                                e('div', { class: 'branch' }, ['L']),
                                renderRecursiveRegion_treeNode(),
                            ]),
                    ),
                    c(
                        (vs) => vs.hasRight,
                        () =>
                            e('div', { class: 'right-child' }, [
                                e('div', { class: 'branch' }, ['R']),
                                renderRecursiveRegion_treeNode(),
                            ]),
                    ),
                ]),
            ],
            refTreeNode(),
        );
    }

    const render = (viewState: BinaryTreeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'binary-tree' }, [renderRecursiveRegion_treeNode()]),
        ) as BinaryTreeElement;
    return [refManager.getPublicAPI() as BinaryTreeElementRefs, render];
}
