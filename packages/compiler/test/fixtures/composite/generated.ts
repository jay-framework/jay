import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

interface ViewState {
  text: string,
  text2: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.text)]),
      e('div', {}, ['static']),
      e('div', {}, [dt(vs => vs.text2)])
    ]));
}

