import {JayElement} from "jay-runtime";

interface ViewState {
  text1: string,
  text2: string,
  cond: boolean
}

export interface ConditionsWithRefsElement extends JayElement<ViewState> {
  text1: HTMLElement,
  text2: HTMLElement
}

export declare function render(viewState: ViewState): ConditionsWithRefsElement