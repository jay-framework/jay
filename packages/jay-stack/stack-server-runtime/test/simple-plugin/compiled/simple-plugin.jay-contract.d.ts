import {
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface SimplePluginViewState {
    pluginSlowlyRendered: string;
    pluginInteractiveRendered: string;
}

export type SimplePluginSlowViewState = Pick<SimplePluginViewState, 'pluginSlowlyRendered'>;
export type SimplePluginFastViewState = Pick<SimplePluginViewState, 'pluginInteractiveRendered'>;;
export type SimplePluginInteractiveViewState = Pick<SimplePluginViewState, 'pluginInteractiveRendered'>;

export interface SimplePluginRefs {
    pluginButton: HTMLElementProxy<SimplePluginViewState, HTMLButtonElement>;
}

export interface SimplePluginRepeatedRefs {
    pluginButton: HTMLElementCollectionProxy<SimplePluginViewState, HTMLButtonElement>;
}

export type SimplePluginContract = JayContract<
    SimplePluginViewState,
    SimplePluginRefs,
    SimplePluginSlowViewState,
    SimplePluginFastViewState,
    SimplePluginInteractiveViewState>;
