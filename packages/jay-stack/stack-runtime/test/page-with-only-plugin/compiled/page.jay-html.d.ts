import { JayElement, RenderElement, HTMLElementProxy, RenderElementOptions } from 'jay-runtime';
import {SimplePluginViewState} from "../../simple-plugin/compiled/simple-plugin.jay-contract";

export interface PageViewState {
    plugin: SimplePluginViewState
}


export interface PageElementRefs {
    plugin: SimplePluginViewState
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];

export declare function render(options?: RenderElementOptions): PageElementPreRender;
