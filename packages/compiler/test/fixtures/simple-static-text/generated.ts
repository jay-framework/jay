import {JayElement, element as e, ConstructContext} from "jay-runtime";

export interface SimpleStaticTextViewState {
  s1: string
}

export interface SimpleStaticTextRefs {}

export type SimpleStaticTextElement = JayElement<SimpleStaticTextViewState, SimpleStaticTextRefs>

export function render(viewState: SimpleStaticTextViewState): SimpleStaticTextElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, ['static text']));
}