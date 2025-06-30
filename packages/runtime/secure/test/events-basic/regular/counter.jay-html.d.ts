import {
    JayElement,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
} from '@jay-framework/runtime';

export interface CounterViewState {
    title: string;
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adder: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;
export type CounterElementRender = RenderElement<
    CounterViewState,
    CounterElementRefs,
    CounterElement
>;
export type CounterPreRender = [CounterElementRefs, CounterElementRender];

export declare function render(options?: RenderElementOptions): CounterPreRender;
