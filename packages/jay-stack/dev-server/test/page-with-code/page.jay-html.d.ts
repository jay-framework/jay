import {
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface PageViewState {
    title: string;
    content: string;
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
