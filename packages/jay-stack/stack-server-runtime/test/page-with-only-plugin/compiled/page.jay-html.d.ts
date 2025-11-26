import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import {
    SimplePluginRefs,
    SimplePluginViewState,
} from '../../simple-plugin/compiled/simple-plugin.jay-contract';

export interface PageViewState {
    plugin: SimplePluginViewState;
}

export interface PageElementRefs {
    plugin: SimplePluginRefs;
}

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
