import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface AutoCounterViewState {
    count: number;
}

export interface AutoCounterElementRefs {
    autoCount1: HTMLElementProxy<AutoCounterViewState, HTMLButtonElement>;
    autoCount2: HTMLElementProxy<AutoCounterViewState, HTMLButtonElement>;
}


export type AutoCounterSlowViewState = {};
export type AutoCounterFastViewState = {};
export type AutoCounterInteractiveViewState = AutoCounterViewState;

export type AutoCounterElement = JayElement<AutoCounterViewState, AutoCounterElementRefs>;
export type AutoCounterElementRender = RenderElement<
    AutoCounterViewState,
    AutoCounterElementRefs,
    AutoCounterElement
>;
export type AutoCounterElementPreRender = [AutoCounterElementRefs, AutoCounterElementRender];
export type AutoCounterContract = JayContract<
    AutoCounterViewState,
    AutoCounterElementRefs,
    AutoCounterSlowViewState,
    AutoCounterFastViewState,
    AutoCounterInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): AutoCounterElementPreRender;
