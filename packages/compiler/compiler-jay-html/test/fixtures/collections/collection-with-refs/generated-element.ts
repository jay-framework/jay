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
} from 'jay-runtime';

export interface ItemOfCollectionWithRefsViewState {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface GroupItemOfGroupOfCollectionWithRefsViewState {
    itemId: string;
    item: string;
}

export interface GroupOfCollectionWithRefsViewState {
    groupId: string;
    groupItems: Array<GroupItemOfGroupOfCollectionWithRefsViewState>;
}

export interface CollectionWithRefsViewState {
    title: string;
    items: Array<ItemOfCollectionWithRefsViewState>;
    groups: Array<GroupOfCollectionWithRefsViewState>;
}

export interface CollectionWithRefsElementRefs {
    items: {
        name: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
        completed: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
        cost: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
        done: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLButtonElement>;
    }
    groups: {
        groupItems: {
            item: HTMLElementCollectionProxy<GroupItemOfGroupOfCollectionWithRefsViewState, HTMLDivElement>;
        }
    }
}

export type CollectionWithRefsElement = JayElement<
    CollectionWithRefsViewState,
    CollectionWithRefsElementRefs
>;
export type CollectionWithRefsElementRender = RenderElement<
    CollectionWithRefsViewState,
    CollectionWithRefsElementRefs,
    CollectionWithRefsElement
>;
export type CollectionWithRefsElementPreRender = [
    CollectionWithRefsElementRefs,
    CollectionWithRefsElementRender,
];

export function render(options?: RenderElementOptions): CollectionWithRefsElementPreRender {
    const [itemsRefManager, [refName, refCompleted, refCost, refDone]] = ReferencesManager.for(options, [], ['name', 'completed', 'cost', 'done'], [], []);
    const [groupItemsRefManager, [refItem]] = ReferencesManager.for(options, [], ['item'], [], []);
    const [groupsRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        groupItems: groupItemsRefManager
    })
    const [refManager, []] = ReferencesManager.for(
        options, [], [], [], [], {
            items: itemsRefManager,
            groups: groupsRefManager,
        }
    );
    const render = (viewState: CollectionWithRefsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                de('div', {}, [
                    forEach(
                        (vs: CollectionWithRefsViewState) => vs.items,
                        (vs1: ItemOfCollectionWithRefsViewState) => {
                            return e('div', {}, [
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:green; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs1) => vs1.name)],
                                    refName(),
                                ),
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:red; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs1) => vs1.completed)],
                                    refCompleted(),
                                ),
                                e(
                                    'span',
                                    {
                                        style: {
                                            cssText:
                                                'color:blue; width: 100px; display: inline-block;',
                                        },
                                    },
                                    [dt((vs1) => vs1.cost)],
                                    refCost(),
                                ),
                                e(
                                    'button',
                                    {
                                        style: {
                                            cssText:
                                                'border:1px blue; background: darkblue; color: white; display: inline-block;',
                                        },
                                    },
                                    ['done'],
                                    refDone(),
                                ),
                            ]);
                        },
                        'id',
                    ),
                    forEach(
                        (vs: CollectionWithRefsViewState) => vs.groups,
                        (vs1: GroupOfCollectionWithRefsViewState) => {
                            return de('div', {}, [
                                forEach(
                                    (vs1: GroupOfCollectionWithRefsViewState) => vs1.groupItems,
                                    (vs2: GroupItemOfGroupOfCollectionWithRefsViewState) => {
                                        return e('div', {}, [
                                            e('div', {}, [dt((vs2) => vs2.item)], refItem()),
                                        ]);
                                    },
                                    'itemId',
                                ),
                            ]);
                        },
                        'groupId',
                    ),
                ]),
            ]),
        ) as CollectionWithRefsElement;
    return [refManager.getPublicAPI() as CollectionWithRefsElementRefs, render];
}
