import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export enum CurrentStatus {
    success,
    warning,
    error,
}

export interface PageViewState {
    pageTitle: string;
    liveCount: number;
    currentStatus: CurrentStatus;
}

export type PageSlowViewState = Pick<PageViewState, 'pageTitle'>;

export type PageFastViewState = Pick<PageViewState, 'liveCount' | 'currentStatus'>;

export type PageInteractiveViewState = Pick<PageViewState, 'currentStatus'>;

export interface PageRefs {
    cycleButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export interface PageRepeatedRefs {
    cycleButton: HTMLElementCollectionProxy<PageViewState, HTMLButtonElement>;
}

export type PageContract = JayContract<
    PageViewState,
    PageRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;
