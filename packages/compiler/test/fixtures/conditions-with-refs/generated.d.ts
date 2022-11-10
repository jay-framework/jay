import {JayElement, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

export interface ConditionsWithRefsViewState {
  text1: string,
  text2: string,
  cond: boolean
}

export interface ConditionsWithRefsRefs {
  text1: HTMLElementProxy<ConditionsWithRefsViewState, HTMLDivElement>,
  text2: HTMLElementProxy<ConditionsWithRefsViewState, HTMLSpanElement>
}

export type ConditionsWithRefsElement = JayElement<ConditionsWithRefsViewState, ConditionsWithRefsRefs>

export declare function render(viewState: ConditionsWithRefsViewState, options?: RenderElementOptions): ConditionsWithRefsElement