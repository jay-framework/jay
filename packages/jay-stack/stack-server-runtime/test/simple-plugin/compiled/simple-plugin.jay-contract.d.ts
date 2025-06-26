import {
    HTMLElementProxy,
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from 'jay-runtime';

export interface SimplePluginViewState {
    pluginSlowlyRendered: string;
    pluginInteractiveRendered: string;
}

export interface SimplePluginRefs {
    pluginButton: HTMLElementProxy<SimplePluginViewState, HTMLButtonElement>;
}

export interface SimplePluginRepeatedRefs {}

export type SimplePluginElement = JayElement<SimplePluginViewState, SimplePluginRefs>;
export type SimplePluginElementRender = RenderElement<
    SimplePluginViewState,
    SimplePluginRefs,
    SimplePluginElement
>;
export type SimplePluginElementPreRender = [SimplePluginRefs, SimplePluginElementRender];
export type SimplePluginContract = JayContract<SimplePluginViewState, SimplePluginElementRefs>;

export declare function render(options?: RenderElementOptions): SimplePluginElementPreRender;
