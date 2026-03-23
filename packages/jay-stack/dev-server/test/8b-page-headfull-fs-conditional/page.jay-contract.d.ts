import {
    HTMLElementProxy,
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface PageViewState {
    title: string;
    showWidget: boolean;
}

export interface PageRefs {
    toggleButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export interface PageRepeatedRefs {}

export type PageSlowViewState = Pick<PageViewState, 'title'>;
export type PageFastViewState = Pick<PageViewState, 'showWidget'>;
export type PageInteractiveViewState = Pick<PageViewState, 'showWidget'>;

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
