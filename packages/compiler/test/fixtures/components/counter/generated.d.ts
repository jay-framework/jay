import {JayElement, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

export interface CounterViewState {
  count: number
}

export interface CounterRefs {
  subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>,
  adderButton: HTMLElementProxy<CounterViewState, HTMLButtonElement>
}

export type CounterElement = JayElement<CounterViewState, CounterRefs>

export declare function render(viewState: CounterViewState, options?: RenderElementOptions): CounterElement
