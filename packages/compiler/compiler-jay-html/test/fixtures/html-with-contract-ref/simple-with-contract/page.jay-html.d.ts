import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface PageViewState {
    slowlyRendered: string;
    fastRendered: string;
    fastDynamicRendered: string;
}

export interface PageElementRefs {
    button: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export type PageSlowViewState = Pick<PageViewState, 'slowlyRendered'>;

export type PageFastViewState = Pick<PageViewState, 'fastRendered' | 'fastDynamicRendered'>;

export type PageInteractiveViewState = Pick<PageViewState, 'fastDynamicRendered'>;

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
