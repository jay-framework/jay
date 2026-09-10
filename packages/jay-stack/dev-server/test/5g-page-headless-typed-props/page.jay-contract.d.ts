import { JayContract } from '@jay-framework/runtime';

export enum ReqStatus {
    success,
    warning,
    error,
}

export interface PageViewState {
    pageTitle: string;
    reqStatus: ReqStatus;
    reqCount: number;
    reqActive: boolean;
}

export type PageSlowViewState = Pick<PageViewState, 'pageTitle'>;

export type PageFastViewState = Pick<PageViewState, 'reqStatus' | 'reqCount' | 'reqActive'>;

export type PageInteractiveViewState = {};

export interface PageRefs {}

export interface PageRepeatedRefs {}

export type PageContract = JayContract<
    PageViewState,
    PageRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;
