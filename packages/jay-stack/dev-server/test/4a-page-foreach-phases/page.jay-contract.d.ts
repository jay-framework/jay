import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface SlowItemOfPageViewState {
    _id: string;
    label: string;
}

export interface FastItemOfPageViewState {
    _id: string;
    label: string;
}

export interface FastMixedItemOfPageViewState {
    _id: string;
    label: string;
    count: number;
}

export interface InteractiveItemOfPageViewState {
    _id: string;
    label: string;
    count: number;
}

export interface PageViewState {
    title: string;
    slowItems: Array<SlowItemOfPageViewState>;
    fastItems: Array<FastItemOfPageViewState>;
    fastMixedItems: Array<FastMixedItemOfPageViewState>;
    interactiveItems: Array<InteractiveItemOfPageViewState>;
}

export type PageSlowViewState = Pick<PageViewState, 'title'> & {
    slowItems: Array<PageViewState['slowItems'][number]>;
};

export type PageFastViewState = {
    fastItems: Array<PageViewState['fastItems'][number]>;
    fastMixedItems: Array<PageViewState['fastMixedItems'][number]>;
    interactiveItems: Array<PageViewState['interactiveItems'][number]>;
};

export type PageInteractiveViewState = {
    fastMixedItems: Array<Pick<PageViewState['fastMixedItems'][number], '_id' | 'count'>>;
    interactiveItems: Array<PageViewState['interactiveItems'][number]>;
};

export interface PageRefs {
    addButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    removeButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    fastMixedItems: {
        increment: HTMLElementCollectionProxy<FastMixedItemOfPageViewState, HTMLButtonElement>;
    };
    interactiveItems: {
        increment: HTMLElementCollectionProxy<InteractiveItemOfPageViewState, HTMLButtonElement>;
    };
}

export interface PageRepeatedRefs {
    addButton: HTMLElementCollectionProxy<PageViewState, HTMLButtonElement>;
    removeButton: HTMLElementCollectionProxy<PageViewState, HTMLButtonElement>;
    fastMixedItems: {
        increment: HTMLElementCollectionProxy<FastMixedItemOfPageViewState, HTMLButtonElement>;
    };
    interactiveItems: {
        increment: HTMLElementCollectionProxy<InteractiveItemOfPageViewState, HTMLButtonElement>;
    };
}

export type PageContract = JayContract<
    PageViewState,
    PageRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;
