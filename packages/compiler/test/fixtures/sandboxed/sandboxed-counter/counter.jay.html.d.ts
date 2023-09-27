import {JayElement, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

export interface CounterViewState {
  count: number
}

export interface CounterElementRefs {
  subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>,
  adder: HTMLElementProxy<CounterViewState, HTMLButtonElement>
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>

export declare function render(viewState: CounterViewState, options?: RenderElementOptions): CounterElement