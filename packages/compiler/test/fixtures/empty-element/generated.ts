import {JayElement, element as e, ConstructContext} from "jay-runtime";

interface ViewState {

}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
    e('div', {}, [
      e('div', {attr: 'value'}, [])
    ]));
}