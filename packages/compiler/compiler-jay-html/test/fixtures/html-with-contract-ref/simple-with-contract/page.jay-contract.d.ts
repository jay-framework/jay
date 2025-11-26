import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface PageViewState {
    slowlyRendered: string;
    fastRendered: string;
    fastDynamicRendered: string;
}

export type PageSlowViewState = Pick<PageViewState, 'slowlyRendered'>;

export type PageFastViewState = Pick<PageViewState, 'fastRendered' | 'fastDynamicRendered'>;

export type PageInteractiveViewState = Pick<PageViewState, 'fastDynamicRendered'>;

export interface PageRefs {
    button: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export interface PageRepeatedRefs {
    button: HTMLElementCollectionProxy<PageViewState, HTMLButtonElement>;
}

export type PageContract = JayContract<
    PageViewState,
    PageRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;

