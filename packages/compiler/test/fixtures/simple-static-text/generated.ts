import {JayElement, element as e, ConstructContext} from "jay-runtime";

interface ViewState {
  s1: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, ['static text']));
}