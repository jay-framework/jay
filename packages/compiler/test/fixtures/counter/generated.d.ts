import {JayElement} from "jay-runtime";

interface ViewState {
  count: number
}

export interface CounterElement extends JayElement<ViewState> {
  subtracter: HTMLElement,
  adder: HTMLElement
}

export declare function render(viewState: ViewState): CounterElement
