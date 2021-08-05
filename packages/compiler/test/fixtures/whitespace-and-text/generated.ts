import {JayElement, element as e, ConstructContext} from "jay-runtime";

interface ViewState {
  text: string,
  text2: string,
  text3: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
    e('div', {}, [
      e('div', {}, [' multi-line text ']),
      e('div', {}, [
        'some text',
        e('span', {}, [' ']),
        'another text'
      ])
    ]));
}