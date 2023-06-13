import {JayElement, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

export interface ChildViewState {
  text: string,
  text2: string
}

export interface ChildElementRefs {
  button: HTMLElementProxy<ChildViewState, HTMLButtonElement>
}

export type ChildElement = JayElement<ChildViewState, ChildElementRefs>

export declare function render(viewState: ChildViewState, options?: RenderElementOptions): ChildElement