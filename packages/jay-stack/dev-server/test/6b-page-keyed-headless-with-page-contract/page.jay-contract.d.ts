import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface PageViewState {
    title: string;
}

export type PageSlowViewState = Pick<PageViewState, 'title'>;

export type PageFastViewState = {};

export type PageInteractiveViewState = {};

export interface PageRefs {
    pageButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export interface PageRepeatedRefs {
    pageButton: HTMLElementCollectionProxy<PageViewState, HTMLButtonElement>;
}

export type PageContract = JayContract<
    PageViewState,
    PageRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;
