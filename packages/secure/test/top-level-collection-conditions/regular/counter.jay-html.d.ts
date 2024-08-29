import {JayElement, HTMLElementProxy, RenderElementOptions, RenderElement} from 'jay-runtime';

export interface CounterViewState {
    title: string;
    count: number;
    id: string;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adder: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;
export type CounterElementRender = RenderElement<CounterViewState, CounterElementRefs, CounterElement>
export type CounterElementPreRender = [refs: CounterElementRefs, CounterElementRender]

export declare function render(
    options?: RenderElementOptions,
): CounterElementPreRender;
