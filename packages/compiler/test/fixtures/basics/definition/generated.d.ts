import {JayElement, RenderElementOptions} from "jay-runtime";

export interface O1 {
  s2: string,
  n2: number
}

export interface A1 {
  s3: string,
  n3: number
}

export interface DefinitionViewState {
  s1: string,
  n1: number,
  b1: boolean,
  o1: O1,
  a1: Array<A1>
}

export interface DefinitionRefs {}

export type DefinitionElement = JayElement<DefinitionViewState, DefinitionRefs>

export declare function render(viewState: DefinitionViewState, options?: RenderElementOptions): DefinitionElement
