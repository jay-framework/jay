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

export interface LinkedListViewState {
    value: string;
    id: string;
    isLast: boolean;
    next: LinkedListViewState | null;
}

export interface LinkedListElementRefs {
    nodeContent: HTMLElementProxy<LinkedListViewState, HTMLDivElement>;
    listNode: HTMLElementProxy<LinkedListViewState, HTMLDivElement>;
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
    const [refManager, [refNodeContent, refListNode]] = ReferencesManager.for(
        options,
        ['nodeContent', 'listNode'],
        [],
        [],
        [],
    );

    function renderRecursiveRegion_listNode(): BaseJayElement<LinkedListViewState> {
        return de(
            'div',
            { class: 'list-node' },
            [
                e(
                    'div',
                    { class: 'node-content' },
                    [
                        e('span', { class: 'value' }, [dt((vs) => vs.value)]),
                        e('span', { class: 'id' }, [dt((vs) => vs.id)]),
                    ],
                    refNodeContent(),
                ),
                c(
                    (vs) => !vs.isLast,
                    () => e('div', { class: 'next-arrow' }, ['→']),
                ),
                c(
                    (vs) => !vs.isLast,
                    () =>
                        de('div', { class: 'next-node' }, [
                            withData(
                                (vs) => vs.next,
                                () => renderRecursiveRegion_listNode(),
                            ),
                        ]),
                ),
            ],
            refListNode(),
        );
    }

    const render = (viewState: LinkedListViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'linked-list' }, [renderRecursiveRegion_listNode()]),
        ) as LinkedListElement;
    return [refManager.getPublicAPI() as LinkedListElementRefs, render];
}
