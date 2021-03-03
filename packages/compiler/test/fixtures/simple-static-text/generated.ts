import {JayElement, element as e} from "jay-runtime";

interface ViewState {
  s1: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return e('div', {}, ['static text'])
}