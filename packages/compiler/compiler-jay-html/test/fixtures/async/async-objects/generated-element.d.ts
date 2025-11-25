import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface O1OfAsyncObjectsViewState {
    s2: string;
    n2: number;
}

export interface Po1OfAsyncObjectsViewState {
    ps2: string;
    pn2: number;
}

export interface AsyncObjectsViewState {
    o1: O1OfAsyncObjectsViewState;
    po1: Promise<Po1OfAsyncObjectsViewState>;
}

export interface AsyncObjectsElementRefs {}

export type AsyncObjectsSlowViewState = {};
export type AsyncObjectsFastViewState = {};
export type AsyncObjectsInteractiveViewState = AsyncObjectsViewState;

export type AsyncObjectsElement = JayElement<AsyncObjectsViewState, AsyncObjectsElementRefs>;
export type AsyncObjectsElementRender = RenderElement<
    AsyncObjectsViewState,
    AsyncObjectsElementRefs,
    AsyncObjectsElement
>;
export type AsyncObjectsElementPreRender = [AsyncObjectsElementRefs, AsyncObjectsElementRender];
export type AsyncObjectsContract = JayContract<
    AsyncObjectsViewState,
    AsyncObjectsElementRefs,
    AsyncObjectsSlowViewState,
    AsyncObjectsFastViewState,
    AsyncObjectsInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): AsyncObjectsElementPreRender;
