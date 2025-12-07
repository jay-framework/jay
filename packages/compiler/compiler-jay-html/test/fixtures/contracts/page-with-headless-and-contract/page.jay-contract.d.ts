import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface PageViewState {
    title: string;
    description: string;
}

export type PageSlowViewState = Pick<PageViewState, 'title'>;

export type PageFastViewState = Pick<PageViewState, 'description'>;

export type PageInteractiveViewState = {};

export interface PageRefs {
    submitButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export interface PageRepeatedRefs {
    submitButton: HTMLElementCollectionProxy<PageViewState, HTMLButtonElement>;
}

export type PageContract = JayContract<
    PageViewState,
    PageRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;
