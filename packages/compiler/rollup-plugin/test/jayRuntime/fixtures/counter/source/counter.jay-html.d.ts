import {
    JayElement,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
    JayContract,
} from '@jay-framework/runtime';

export interface CounterViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adderButton: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterSlowViewState = {};
export type CounterFastViewState = {};
export type CounterInteractiveViewState = CounterViewState;

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;
export type CounterElementRender = RenderElement<
    CounterViewState,
    CounterElementRefs,
    CounterElement
>;
export type CounterElementPreRender = [CounterElementRefs, CounterElementRender];
export type CounterContract = JayContract<
    CounterViewState,
    CounterElementRefs,
    CounterSlowViewState,
    CounterFastViewState,
    CounterInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): CounterElementPreRender;
