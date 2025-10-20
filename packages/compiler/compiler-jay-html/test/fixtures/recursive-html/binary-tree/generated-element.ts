import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicElement as de,
    conditional as c,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
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
    const [refManager, [refNodeValue]] = ReferencesManager.for(
        options,
        ['nodeValue'],
        [],
        [],
        [],
    );

    function renderRecursiveRegion_treeNode(nodeData: BinaryTreeViewState) {
        return e('div', { class: 'tree-node' }, [
            e('div', { class: 'node-value' }, [dt((vs: BinaryTreeViewState) => vs.value)], refNodeValue()),
            de('div', { class: 'children' }, [
                c(
                    (vs: BinaryTreeViewState) => vs.hasLeft,
                    () =>
                        de('div', { class: 'left-child' }, [
                            e('div', { class: 'branch' }, ['L']),
                            // Recursive call with left child
                            renderRecursiveRegion_treeNode(nodeData.left!),
                        ]),
                ),
                c(
                    (vs: BinaryTreeViewState) => vs.hasRight,
                    () =>
                        de('div', { class: 'right-child' }, [
                            e('div', { class: 'branch' }, ['R']),
                            // Recursive call with right child
                            renderRecursiveRegion_treeNode(nodeData.right!),
                        ]),
                ),
            ]),
        ]);
    }

    const render = (viewState: BinaryTreeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'binary-tree' }, [renderRecursiveRegion_treeNode(viewState)]),
        ) as BinaryTreeElement;

    return [refManager.getPublicAPI() as BinaryTreeElementRefs, render];
}

