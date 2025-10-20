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

export interface LinkedListViewState {
    value: string;
    id: string;
    isLast: boolean;
    next: LinkedListViewState | null;
}

export interface LinkedListElementRefs {
    nodeContent: HTMLElementProxy<LinkedListViewState, HTMLDivElement>;
}

export type LinkedListElement = JayElement<LinkedListViewState, LinkedListElementRefs>;
export type LinkedListElementRender = RenderElement<
    LinkedListViewState,
    LinkedListElementRefs,
    LinkedListElement
>;
export type LinkedListElementPreRender = [LinkedListElementRefs, LinkedListElementRender];
export type LinkedListContract = JayContract<LinkedListViewState, LinkedListElementRefs>;

export function render(options?: RenderElementOptions): LinkedListElementPreRender {
    const [refManager, [refNodeContent]] = ReferencesManager.for(
        options,
        ['nodeContent'],
        [],
        [],
        [],
    );

    function renderRecursiveRegion_listNode(nodeData: LinkedListViewState) {
        return de('div', { class: 'list-node' }, [
            e(
                'div',
                { class: 'node-content' },
                [
                    e('span', { class: 'value' }, [dt((vs: LinkedListViewState) => vs.value)]),
                    e('span', { class: 'id' }, [dt((vs: LinkedListViewState) => vs.id)]),
                ],
                refNodeContent(),
            ),
            c(
                (vs: LinkedListViewState) => !vs.isLast,
                () => e('div', { class: 'next-arrow' }, ['→']),
            ),
            c(
                (vs: LinkedListViewState) => !vs.isLast,
                () =>
                    de('div', { class: 'next-node' }, [
                        // Recursive call with next node (not an array)
                        renderRecursiveRegion_listNode(nodeData.next!),
                    ]),
            ),
        ]);
    }

    const render = (viewState: LinkedListViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'linked-list' }, [renderRecursiveRegion_listNode(viewState)]),
        ) as LinkedListElement;

    return [refManager.getPublicAPI() as LinkedListElementRefs, render];
}

