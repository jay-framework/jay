import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface ItemOfPageViewState {
    _id: string;
    name: string;
}

export interface PageViewState {
    title: string;
    items: Array<ItemOfPageViewState>;
}

export interface PageElementRefs {}

export type PageSlowViewState = {};
export type PageFastViewState = {};
export type PageInteractiveViewState = PageViewState;

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];
export type PageContract = JayContract<
    PageViewState,
    PageElementRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): PageElementPreRender;
