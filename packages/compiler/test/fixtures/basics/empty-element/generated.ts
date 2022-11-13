import {JayElement, element as e, ConstructContext, RenderElementOptions} from "jay-runtime";

export interface EmptyElementViewState {

}

export interface EmptyElementRefs {}

export type EmptyElementElement = JayElement<EmptyElementViewState, EmptyElementRefs>

export function render(viewState: EmptyElementViewState, options?: RenderElementOptions): EmptyElementElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {attr: 'value'}, [])
    ]), options);
}