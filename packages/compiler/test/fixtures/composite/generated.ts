import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

export interface CompositeViewState {
  text: string,
  text2: string
}

export interface CompositeRefs {}

export type CompositeElement = JayElement<CompositeViewState, CompositeRefs>

export function render(viewState: CompositeViewState): CompositeElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.text)]),
      e('div', {}, ['static']),
      e('div', {}, [dt(vs => vs.text2)])
    ]));
}

