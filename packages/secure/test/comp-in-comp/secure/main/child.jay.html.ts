import {JayElement, element as e, dynamicText as dt, ConstructContext, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

export interface ChildViewState {
  textFromProp: string,
  textFromAPI: string
}

export interface ChildElementRefs {
  eventToParent: HTMLElementProxy<ChildViewState, HTMLButtonElement>,
  eventToParentToChildProp: HTMLElementProxy<ChildViewState, HTMLButtonElement>,
  eventToParentToChildApi: HTMLElementProxy<ChildViewState, HTMLButtonElement>
}

export type ChildElement = JayElement<ChildViewState, ChildElementRefs>

export function render(viewState: ChildViewState, options?: RenderElementOptions): ChildElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {id: 'child-text-from-prop'}, [dt(vs => vs.textFromProp)]),
      e('div', {id: 'child-text-from-api'}, [dt(vs => vs.textFromAPI)]),
      e('button', {id: 'event-to-parent-button', ref: 'eventToParent'}, ['event to parent']),
      e('button', {id: 'event-to-parent-to-child-prop-button', ref: 'eventToParentToChildProp'}, ['event to parent, parent update child prop']),
      e('button', {id: 'event-to-parent-to-child-api-button', ref: 'eventToParentToChildApi'}, ['event to parent, parent calls child api'])
    ]), options);
}