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
    HTMLElementCollectionProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export enum ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState {
    state1,
    state2,
}

export interface SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState {
    id: string;
    subTitle: string;
}

export interface ItemOfNestedCollectionWithRefsInVariantsViewState {
    id: string;
    itemState: ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState;
    title: string;
    subItems: Array<SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState>;
}

export interface NestedCollectionWithRefsInVariantsViewState {
    items: Array<ItemOfNestedCollectionWithRefsInVariantsViewState>;
}

export interface NestedCollectionWithRefsInVariantsElementRefs {
    items: {
        subItems: {
            nestedRef: HTMLElementCollectionProxy<
                SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState,
                HTMLDivElement
            >;
        };
    };
}

export type NestedCollectionWithRefsInVariantsElement = JayElement<
    NestedCollectionWithRefsInVariantsViewState,
    NestedCollectionWithRefsInVariantsElementRefs
>;
export type NestedCollectionWithRefsInVariantsElementRender = RenderElement<
    NestedCollectionWithRefsInVariantsViewState,
    NestedCollectionWithRefsInVariantsElementRefs,
    NestedCollectionWithRefsInVariantsElement
>;
export type NestedCollectionWithRefsInVariantsElementPreRender = [
    NestedCollectionWithRefsInVariantsElementRefs,
    NestedCollectionWithRefsInVariantsElementRender,
];
export type NestedCollectionWithRefsInVariantsContract = JayContract<
    NestedCollectionWithRefsInVariantsViewState,
    NestedCollectionWithRefsInVariantsElementRefs
>;

export function render(
    options?: RenderElementOptions,
): NestedCollectionWithRefsInVariantsElementPreRender {
    const [subItemsRefManager, [refNestedRef]] = ReferencesManager.for(
        options,
        [],
        ['nestedRef'],
        [],
        [],
    );
    const [itemsRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        subItems: subItemsRefManager,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState: NestedCollectionWithRefsInVariantsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                forEach(
                    (vs: NestedCollectionWithRefsInVariantsViewState) => vs.items,
                    (vs1: ItemOfNestedCollectionWithRefsInVariantsViewState) => {
                        return e('div', {}, [
                            de('div', {}, [
                                c(
                                    (vs1) =>
                                        vs1.itemState ===
                                        ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState.state1,
                                    () =>
                                        e('div', {}, [
                                            e('div', {}, [
                                                e('div', {}, [
                                                    e('div', {}, [dt((vs1) => vs1.title)]),
                                                    de('div', {}, [
                                                        forEach(
                                                            (
                                                                vs1: ItemOfNestedCollectionWithRefsInVariantsViewState,
                                                            ) => vs1.subItems,
                                                            (
                                                                vs2: SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState,
                                                            ) => {
                                                                return e('div', {}, [
                                                                    e('div', {}, [
                                                                        e('div', {}, [
                                                                            dt(
                                                                                (vs2) =>
                                                                                    vs2.subTitle,
                                                                            ),
                                                                        ]),
                                                                        e(
                                                                            'div',
                                                                            {},
                                                                            [],
                                                                            refNestedRef(),
                                                                        ),
                                                                    ]),
                                                                ]);
                                                            },
                                                            'id',
                                                        ),
                                                    ]),
                                                ]),
                                            ]),
                                        ]),
                                ),
                                c(
                                    (vs1) =>
                                        vs1.itemState ===
                                        ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState.state2,
                                    () =>
                                        e('div', {}, [
                                            e('div', {}, [
                                                e('div', {}, [
                                                    e('div', {}, [dt((vs1) => vs1.title)]),
                                                    de('div', {}, [
                                                        forEach(
                                                            (
                                                                vs1: ItemOfNestedCollectionWithRefsInVariantsViewState,
                                                            ) => vs1.subItems,
                                                            (
                                                                vs2: SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState,
                                                            ) => {
                                                                return e('div', {}, [
                                                                    e('div', {}, [
                                                                        e('div', {}, [
                                                                            dt(
                                                                                (vs2) =>
                                                                                    vs2.subTitle,
                                                                            ),
                                                                        ]),
                                                                        e(
                                                                            'div',
                                                                            {},
                                                                            [],
                                                                            refNestedRef(),
                                                                        ),
                                                                    ]),
                                                                ]);
                                                            },
                                                            'id',
                                                        ),
                                                    ]),
                                                ]),
                                            ]),
                                        ]),
                                ),
                            ]),
                        ]);
                    },
                    'id',
                ),
            ]),
        ) as NestedCollectionWithRefsInVariantsElement;
    return [refManager.getPublicAPI() as NestedCollectionWithRefsInVariantsElementRefs, render];
}
