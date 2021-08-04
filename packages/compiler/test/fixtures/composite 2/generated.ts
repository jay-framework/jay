import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

interface ViewState {
  title: string,
  subtitle: string,
  article: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
    e('div', {}, [
      e('h1', {}, [dt(context, vs => vs.title)]),
      e('section', {}, [
        e('div', {}, [dt(context, vs => vs.subtitle)]),
        e('div', {}, [dt(context, vs => vs.article)])
      ])
    ]));
}
