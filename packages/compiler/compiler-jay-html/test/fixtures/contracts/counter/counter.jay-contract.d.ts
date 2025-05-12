import {
    JayElement,
    RenderElement,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
} from 'jay-runtime';

export interface CounterViewState {
    count: number;
}

export interface CounterRefs {
    add: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    subtract: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export interface CounterRepeatedRefs {
    add: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
    subtract: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterElement = JayElement<CounterViewState, CounterRefs>;
export type CounterElementRender = RenderElement<CounterViewState, CounterRefs, CounterElement>;
export type CounterElementPreRender = [CounterRefs, CounterElementRender];

export declare function render(options?: RenderElementOptions): CounterElementPreRender;
