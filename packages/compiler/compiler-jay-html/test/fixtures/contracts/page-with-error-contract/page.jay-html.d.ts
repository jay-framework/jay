import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import {
    ErrorViewState,
    ErrorRefs,
    DetailOfErrorViewState,
} from '@jay-framework/fullstack-component';

export interface PageViewState {
    error?: ErrorViewState;
}

export interface PageElementRefs {
    error: ErrorRefs;
}

export type PageSlowViewState = {};
export type PageFastViewState = PageViewState;
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
