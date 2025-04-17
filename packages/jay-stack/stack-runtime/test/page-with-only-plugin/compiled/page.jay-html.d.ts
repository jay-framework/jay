import { JayElement, RenderElement, HTMLElementProxy, RenderElementOptions } from 'jay-runtime';
import {SimplePluginRefs, SimplePluginViewState} from "../../simple-plugin/compiled/simple-plugin.jay-contract";

export interface PageViewState {
    plugin: SimplePluginViewState
}


export interface PageElementRefs {
    plugin: SimplePluginRefs
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];

export declare function render(options?: RenderElementOptions): PageElementPreRender;
