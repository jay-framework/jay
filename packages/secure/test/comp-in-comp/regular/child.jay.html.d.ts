import {JayElement, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

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

export declare function render(viewState: ChildViewState, options?: RenderElementOptions): ChildElement