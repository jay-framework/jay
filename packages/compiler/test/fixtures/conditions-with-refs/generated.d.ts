import {JayElement} from "jay-runtime";

export interface ConditionsWithRefsViewState {
  text1: string,
  text2: string,
  cond: boolean
}

export interface ConditionsWithRefsRefs {
  text1: HTMLDivElement,
  text2: HTMLSpanElement
}

export type ConditionsWithRefsElement = JayElement<ConditionsWithRefsViewState, ConditionsWithRefsRefs>

export declare function render(viewState: ConditionsWithRefsViewState): ConditionsWithRefsElement