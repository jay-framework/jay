import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

interface ViewState {
  title: string,
  subtitle: string,
  article: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('h1', {}, [dt(vs => vs.title)]),
      e('section', {}, [
        e('div', {}, [dt(vs => vs.subtitle)]),
        e('div', {}, [dt(vs => vs.article)])
      ])
    ]));
}
