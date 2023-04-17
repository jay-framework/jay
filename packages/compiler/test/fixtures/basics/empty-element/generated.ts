import {JayElement, element as e, ConstructContext, RenderElementOptions} from "jay-runtime";

export interface EmptyElementViewState {

}

export interface EmptyElementElementRefs {}

export type EmptyElementElement = JayElement<EmptyElementViewState, EmptyElementElementRefs>

export function render(viewState: EmptyElementViewState, options?: RenderElementOptions): EmptyElementElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {attr: 'value'}, [])
    ]), options);
}