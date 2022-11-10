import {JayElement, HTMLElementCollectionProxy, RenderElementOptions} from "jay-runtime";

export interface Item {
  name: string,
  completed: boolean,
  cost: number,
  id: string
}

export interface CollectionWithRefsViewState {
  title: string,
  items: Array<Item>
}

export interface CollectionWithRefsRefs {
  name: HTMLElementCollectionProxy<Item, HTMLSpanElement>,
  completed: HTMLElementCollectionProxy<Item, HTMLSpanElement>,
  cost: HTMLElementCollectionProxy<Item, HTMLSpanElement>,
  done: HTMLElementCollectionProxy<Item, HTMLButtonElement>
}

export type CollectionWithRefsElement = JayElement<CollectionWithRefsViewState, CollectionWithRefsRefs>

export declare function render(viewState: CollectionWithRefsViewState, options?: RenderElementOptions): CollectionWithRefsElement

