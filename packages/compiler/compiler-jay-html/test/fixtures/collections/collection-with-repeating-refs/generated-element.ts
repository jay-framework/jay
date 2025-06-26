import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementCollectionProxy,
    RenderElementOptions,
    JayContract,
} from 'jay-runtime';

export interface ItemOfCollectionWithRepeatingRefsViewState {
    id: string;
}

export interface Items2OfCollectionWithRepeatingRefsViewState {
    id: string;
}

export interface CollectionWithRepeatingRefsViewState {
    items: Array<ItemOfCollectionWithRepeatingRefsViewState>;
    items2: Array<Items2OfCollectionWithRepeatingRefsViewState>;
}

export interface CollectionWithRepeatingRefsElementRefs {
    items: {
        editItem: HTMLElementCollectionProxy<
            ItemOfCollectionWithRepeatingRefsViewState,
            HTMLDivElement
        >;
    };
    items2: {
        editItem: HTMLElementCollectionProxy<
            Items2OfCollectionWithRepeatingRefsViewState,
            HTMLDivElement
        >;
    };
}

export type CollectionWithRepeatingRefsElement = JayElement<
    CollectionWithRepeatingRefsViewState,
    CollectionWithRepeatingRefsElementRefs
>;
export type CollectionWithRepeatingRefsElementRender = RenderElement<
    CollectionWithRepeatingRefsViewState,
    CollectionWithRepeatingRefsElementRefs,
    CollectionWithRepeatingRefsElement
>;
export type CollectionWithRepeatingRefsElementPreRender = [
    CollectionWithRepeatingRefsElementRefs,
    CollectionWithRepeatingRefsElementRender,
];
export type CollectionWithRepeatingRefsContract = JayContract<CollectionWithRepeatingRefsViewState, CollectionWithRepeatingRefsElementRefs>;

export function render(
    options?: RenderElementOptions,
): CollectionWithRepeatingRefsElementPreRender {
    const [itemsRefManager, [refEditItem]] = ReferencesManager.for(
        options,
        [],
        ['editItem'],
        [],
        [],
    );
    const [items2RefManager, [refEditItem2]] = ReferencesManager.for(
        options,
        [],
        ['editItem'],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
        items2: items2RefManager,
    });
    const render = (viewState: CollectionWithRepeatingRefsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                forEach(
                    (vs: CollectionWithRepeatingRefsViewState) => vs.items,
                    (vs1: ItemOfCollectionWithRepeatingRefsViewState) => {
                        return e('div', {}, [
                            e('div', {}, [dt((vs1) => ` ${vs1.id} `)], refEditItem()),
                        ]);
                    },
                    'id',
                ),
                forEach(
                    (vs: CollectionWithRepeatingRefsViewState) => vs.items2,
                    (vs1: Items2OfCollectionWithRepeatingRefsViewState) => {
                        return e('div', {}, [
                            e('div', {}, [dt((vs1) => ` ${vs1.id} `)], refEditItem2()),
                        ]);
                    },
                    'id',
                ),
            ]),
        ) as CollectionWithRepeatingRefsElement;
    return [refManager.getPublicAPI() as CollectionWithRepeatingRefsElementRefs, render];
}
