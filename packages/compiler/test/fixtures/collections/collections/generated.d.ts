import {JayElement, RenderElementOptions} from "jay-runtime";

export interface Thing {
  name: string,
  completed: boolean,
  cost: number,
  id: string
}

export interface CollectionsViewState {
  title: string,
  things: Array<Thing>
}

export interface CollectionsRefs {}

export type CollectionsElement = JayElement<CollectionsViewState, CollectionsRefs>

export declare function render(viewState: CollectionsViewState, options?: RenderElementOptions): CollectionsElement

