import {JayElement, element as e, ConstructContext} from "jay-runtime";

export interface EmptyElementViewState {

}

export interface EmptyElementRefs {}

export type EmptyElementElement = JayElement<EmptyElementViewState, EmptyElementRefs>

export function render(viewState: EmptyElementViewState): EmptyElementElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {attr: 'value'}, [])
    ]));
}