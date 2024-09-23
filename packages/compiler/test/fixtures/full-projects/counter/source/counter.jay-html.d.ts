import { JayElement, RenderElement, HTMLElementProxy, RenderElementOptions } from 'jay-runtime';

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
export type CounterElementPreRender = [refs: CounterElementRefs, CounterElementRender];

export declare function render(options?: RenderElementOptions): CounterElementPreRender;
