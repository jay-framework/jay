import {JayElement, element as e, dynamicText as dt} from "jay-runtime";

interface ViewState {
  title: string,
  subtitle: string,
  article: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return e('div', {}, [
    e('h1', {}, [dt(viewState, vs => vs.title)]),
    e('section', {}, [
      e('div', {}, [dt(viewState, vs => vs.subtitle)]),
      e('div', {}, [dt(viewState, vs => vs.article)])
    ])
  ]);
}
