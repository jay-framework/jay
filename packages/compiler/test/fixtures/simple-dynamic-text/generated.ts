import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

interface ViewState {
  s1: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
      e('div', {}, [dt(context, vs => vs.s1)]));
}