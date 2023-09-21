import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';

export interface Item {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionsViewState {
    items: Array<Item>;
    title: string;
    numberOfItems: number;
}

export interface CollectionsElementRefs {}

export type CollectionsElement = JayElement<CollectionsViewState, CollectionsElementRefs>;

export function render(
    viewState: CollectionsViewState,
    options?: RenderElementOptions,
): CollectionsElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                e('p', {}, [dt((vs) => `Number of items: ${vs.numberOfItems}`)]),
                de('div', {}, [
                    forEach(
                        (vs) => vs.items,
                        (vs1: Item) => {
                            return e('div', {}, [
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:green; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs) => vs.name)],
                                ),
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:red; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs) => vs.completed)],
                                ),
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:blue; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs) => vs.cost)],
                                ),
                            ]);
                        },
                        'id',
                    ),
                ]),
            ]),
        options,
    );
}
