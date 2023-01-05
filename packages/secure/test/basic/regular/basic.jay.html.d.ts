import {JayElement, RenderElementOptions} from "jay-runtime";

export interface BasicViewState {
  text: string
}

export interface BasicRefs {}

export type BasicElement = JayElement<BasicViewState, BasicRefs>

export declare function render(viewState: BasicViewState, options?: RenderElementOptions): BasicElement