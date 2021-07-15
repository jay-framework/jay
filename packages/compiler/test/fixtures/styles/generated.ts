import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

interface ViewState {
  text1: string,
  text2: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
      e('div', {}, [
        e('div', {style: {cssText: 'color:red'}}, [dt(context, vs => vs.text1)]),
        e('div', {style: {cssText: 'color:green'}}, [dt(context, vs => vs.text2)])
      ]));
}

