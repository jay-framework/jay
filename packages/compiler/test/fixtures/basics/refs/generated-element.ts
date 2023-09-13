import {JayElement, element as e, dynamicText as dt, ConstructContext, HTMLElementProxy, elemRef as er, RenderElementOptions} from "jay-runtime";

export interface RefsViewState {
  text: string
}

export interface RefsElementRefs {
  ref1: HTMLElementProxy<RefsViewState, HTMLDivElement>,
  ref: HTMLElementProxy<RefsViewState, HTMLDivElement>,
  ref3: HTMLElementProxy<RefsViewState, HTMLDivElement>
}

export type RefsElement = JayElement<RefsViewState, RefsElementRefs>

export function render(viewState: RefsViewState, options?: RenderElementOptions): RefsElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.text)], er('ref1')),
      e('div', {}, [dt(vs => vs.text)], er('ref')),
      e('div', {}, [
        e('div', {}, [dt(vs => vs.text)], er('ref3'))
      ])
    ]), options);
}