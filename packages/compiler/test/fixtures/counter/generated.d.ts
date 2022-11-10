import {JayElement, RenderElementOptions} from "jay-runtime";

export interface CounterViewState {
  count: number
}

export interface CounterRefs {
  subtracter: HTMLButtonElement,
  adderButton: HTMLButtonElement
}

export type CounterElement = JayElement<CounterViewState, CounterRefs>

export declare function render(viewState: CounterViewState, options?: RenderElementOptions): CounterElement
