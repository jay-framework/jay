import {
    JayElement,
    RenderElement,
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

export interface ItemsOfCollectionWithRefsElementRefs {
    name: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
    completed: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
    cost: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
    done: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLButtonElement>;
}

export interface GroupItemsOfGroupsOfCollectionWithRefsElementRefs {
    item: HTMLElementCollectionProxy<GroupItemOfGroupOfCollectionWithRefsViewState, HTMLSpanElement>;
}

export interface GroupsOfCollectionWithRefsElementRefs {
    groupItems: GroupItemsOfGroupsOfCollectionWithRefsElementRefs
}

export interface CollectionWithRefsElementRefs {
    items: ItemsOfCollectionWithRefsElementRefs
    groups: GroupsOfCollectionWithRefsElementRefs
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

export declare function render(options?: RenderElementOptions): CollectionWithRefsElementPreRender;
