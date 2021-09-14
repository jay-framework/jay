import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

interface ViewState {
  text1: string,
  text2: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {style: {cssText: 'color:red'}}, [dt(vs => vs.text1)]),
      e('div', {style: {cssText: 'color:green'}}, [dt(vs => vs.text2)])
    ]));
}

