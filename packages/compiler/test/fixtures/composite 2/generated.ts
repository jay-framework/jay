import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

export interface Composite2ViewState {
  title: string,
  subtitle: string,
  article: string
}

export interface Composite2Refs {}

export type Composite2Element = JayElement<Composite2ViewState, Composite2Refs>

export function render(viewState: Composite2ViewState): Composite2Element {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('h1', {}, [dt(vs => vs.title)]),
      e('section', {}, [
        e('div', {}, [dt(vs => vs.subtitle)]),
        e('div', {}, [dt(vs => vs.article)])
      ])
    ]));
}
