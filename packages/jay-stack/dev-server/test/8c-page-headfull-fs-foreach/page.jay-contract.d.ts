import {
    HTMLElementProxy,
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface PageItemViewState {
    _id: string;
    name: string;
}

export interface PageViewState {
    title: string;
    items: PageItemViewState[];
}

export interface PageRefs {
    addButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    removeButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export interface PageRepeatedRefs {}

export type PageSlowViewState = Pick<PageViewState, 'title'>;
export type PageFastViewState = Pick<PageViewState, 'items'>;
export type PageInteractiveViewState = Pick<PageViewState, 'items'>;

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
