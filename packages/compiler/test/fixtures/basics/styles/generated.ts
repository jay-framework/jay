import {JayElement, element as e, dynamicText as dt, ConstructContext, RenderElementOptions} from "jay-runtime";

export interface StylesViewState {
  text1: string,
  text2: string
}

export interface StylesElementRefs {}

export type StylesElement = JayElement<StylesViewState, StylesElementRefs>

export function render(viewState: StylesViewState, options?: RenderElementOptions): StylesElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {style: {cssText: 'color:red'}}, [dt(vs => vs.text1)]),
      e('div', {style: {cssText: 'color:green'}}, [dt(vs => vs.text2)])
    ]), options);
}

