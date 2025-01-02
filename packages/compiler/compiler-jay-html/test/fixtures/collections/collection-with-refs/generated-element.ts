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

export interface Item {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface GroupItem {
    itemId: string;
    item: string;
}

export interface Group {
    groupId: string;
    groupItems: Array<GroupItem>;
}

export interface CollectionWithRefsViewState {
    title: string;
    items: Array<Item>;
    groups: Array<Group>;
}

export interface CollectionWithRefsElementRefs {
    name: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    completed: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    cost: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    done: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
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
    const [refManager, [refName, refCompleted, refCost, refDone]] = ReferencesManager.for(
        options,
        [],
        ['name', 'completed', 'cost', 'done'],
        [],
        [],
    );
    const render = (viewState: CollectionWithRefsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                de('div', {}, [
                    forEach(
                        (vs: CollectionWithRefsViewState) => vs.items,
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
                        (vs1: Group) => {
                            return de('div', {}, [
                                forEach(
                                    (vs1: Group) => vs1.groupItems,
                                    (vs2: GroupItem) => {
                                        return e('div', {}, [
                                            e('div', {}, [dt((vs2) => vs2.item)]),
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
