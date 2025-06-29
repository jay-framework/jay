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

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;
export type CounterElementRender = RenderElement<
    CounterViewState,
    CounterElementRefs,
    CounterElement
>;
export type CounterElementPreRender = [CounterElementRefs, CounterElementRender];
export type CounterContract = JayContract<CounterViewState, CounterElementRefs>;

export declare function render(options?: RenderElementOptions): CounterElementPreRender;
