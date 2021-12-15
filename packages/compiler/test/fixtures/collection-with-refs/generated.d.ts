import {JayElement, DynamicReference} from "jay-runtime";

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
  name: DynamicReference<Item, HTMLSpanElement>,
  completed: DynamicReference<Item, HTMLSpanElement>,
  cost: DynamicReference<Item, HTMLSpanElement>,
  done: DynamicReference<Item, HTMLButtonElement>
}

export type CollectionWithRefsElement = JayElement<CollectionWithRefsViewState, CollectionWithRefsRefs>

export declare function render(viewState: CollectionWithRefsViewState): CollectionWithRefsElement

