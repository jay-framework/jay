import {JayElement} from "jay-runtime";

export interface CounterViewState {
  count: number
}

export interface CounterRefs {
  subtracter: HTMLElement,
  adder: HTMLElement
}

export type CounterElement = JayElement<CounterViewState, CounterRefs>

export declare function render(viewState: CounterViewState): CounterElement
