import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface A1OfAsyncArraysViewState {
    s3: string;
    n3: number;
}

export interface Pa1OfAsyncArraysViewState {
    ps3: string;
    pn3: number;
}

export interface AsyncArraysViewState {
    a1: Array<A1OfAsyncArraysViewState>;
    pa1: Promise<Array<Pa1OfAsyncArraysViewState>>;
}

export interface AsyncArraysElementRefs {}

export type AsyncArraysSlowViewState = {};
export type AsyncArraysFastViewState = {};
export type AsyncArraysInteractiveViewState = AsyncArraysViewState;

export type AsyncArraysElement = JayElement<AsyncArraysViewState, AsyncArraysElementRefs>;
export type AsyncArraysElementRender = RenderElement<
    AsyncArraysViewState,
    AsyncArraysElementRefs,
    AsyncArraysElement
>;
export type AsyncArraysElementPreRender = [AsyncArraysElementRefs, AsyncArraysElementRender];
export type AsyncArraysContract = JayContract<
    AsyncArraysViewState,
    AsyncArraysElementRefs,
    AsyncArraysSlowViewState,
    AsyncArraysFastViewState,
    AsyncArraysInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): AsyncArraysElementPreRender;
