import {
    JayElement,
    RenderElement,
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

export declare function render(options?: RenderElementOptions): CollectionWithRefsElementPreRender;
