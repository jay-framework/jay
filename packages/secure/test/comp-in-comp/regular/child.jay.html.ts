import {JayElement, element as e, dynamicText as dt, ConstructContext, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

export interface ChildViewState {
  text: string,
  text2: string
}

export interface ChildElementRefs {
  button: HTMLElementProxy<ChildViewState, HTMLButtonElement>
}

export type ChildElement = JayElement<ChildViewState, ChildElementRefs>

export function render(viewState: ChildViewState, options?: RenderElementOptions): ChildElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.text)]),
      e('div', {}, [dt(vs => vs.text2)]),
      e('button', {ref: 'button'}, ['click'])
    ]), options);
}