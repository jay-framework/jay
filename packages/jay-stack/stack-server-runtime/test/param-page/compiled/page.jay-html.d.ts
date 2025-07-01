import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface PageViewState {
    slowlyRendered: string;
    fastDynamicRendered: string;
}

export interface PageElementRefs {
    button: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];

export declare function render(options?: RenderElementOptions): PageElementPreRender;
