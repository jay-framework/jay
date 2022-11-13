import {JayElement, element as e, dynamicText as dt, ConstructContext, RenderElementOptions} from "jay-runtime";

export interface SimpleDynamicTextViewState {
  s1: string
}

export interface SimpleDynamicTextRefs {}

export type SimpleDynamicTextElement = JayElement<SimpleDynamicTextViewState, SimpleDynamicTextRefs>

export function render(viewState: SimpleDynamicTextViewState, options?: RenderElementOptions): SimpleDynamicTextElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [dt(vs => vs.s1)]), options);
}