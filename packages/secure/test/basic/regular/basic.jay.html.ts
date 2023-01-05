import {JayElement, element as e, dynamicText as dt, ConstructContext, RenderElementOptions} from "jay-runtime";

export interface BasicViewState {
  text: string
}

export interface BasicRefs {}

export type BasicElement = JayElement<BasicViewState, BasicRefs>

export function render(viewState: BasicViewState, options?: RenderElementOptions): BasicElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.text)])
    ]), options);
}