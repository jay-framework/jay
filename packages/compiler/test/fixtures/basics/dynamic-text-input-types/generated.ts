import {JayElement, element as e, dynamicText as dt, ConstructContext, RenderElementOptions} from "jay-runtime";

export interface DynamicTextInputTypesViewState {
  n1: number,
  n2: number
}

export interface DynamicTextInputTypesRefs {}

export type DynamicTextInputTypesElement = JayElement<DynamicTextInputTypesViewState, DynamicTextInputTypesRefs>

export function render(viewState: DynamicTextInputTypesViewState, options?: RenderElementOptions): DynamicTextInputTypesElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.n1)]),
      e('div', {}, [dt(vs => `${vs.n1} + ${vs.n2}`)])
    ]), options);
}