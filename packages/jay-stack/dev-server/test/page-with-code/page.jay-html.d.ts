import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';

export interface PageViewState {
    title: string;
    content: string;
}

export interface PageElementRefs {
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];

export declare function render(options?: RenderElementOptions): PageElementPreRender;
