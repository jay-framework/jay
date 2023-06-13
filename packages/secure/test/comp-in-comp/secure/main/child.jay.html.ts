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
        e('div', {id: 'child-text-1'}, [dt(vs => vs.text)]),
        e('div', {id: 'child-text-2'}, [dt(vs => vs.text2)]),
        e('button', {id: 'child-button', ref: 'button'}, ['click'])
    ]), options);
}