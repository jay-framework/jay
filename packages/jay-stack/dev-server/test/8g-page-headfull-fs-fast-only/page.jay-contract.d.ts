import {
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface PageViewState {
    title: string;
}

export interface PageRefs {}
export interface PageRepeatedRefs {}

export type PageSlowViewState = {};
export type PageFastViewState = PageViewState;
export type PageInteractiveViewState = PageViewState;

export type PageElement = JayElement<PageViewState, PageRefs>;
export type PageElementRender = RenderElement<PageViewState, PageRefs, PageElement>;
export type PageElementPreRender = [PageRefs, PageElementRender];
export type PageContract = JayContract<
    PageViewState,
    PageRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): PageElementPreRender;
