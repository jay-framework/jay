import {
    JayElement,
    RenderElement,
    HTMLElementCollectionProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

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
    };
    groups: {
        groupItems: {
            item: HTMLElementCollectionProxy<
                GroupItemOfGroupOfCollectionWithRefsViewState,
                HTMLDivElement
            >;
        };
    };
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
export type CollectionWithRefsContract = JayContract<
    CollectionWithRefsViewState,
    CollectionWithRefsElementRefs
>;

export declare function render(options?: RenderElementOptions): CollectionWithRefsElementPreRender;
