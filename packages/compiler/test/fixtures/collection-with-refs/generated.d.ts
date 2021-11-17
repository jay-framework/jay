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
  name: DynamicReference<Item>,
  completed: DynamicReference<Item>,
  cost: DynamicReference<Item>,
  done: DynamicReference<Item>
}

export type CollectionWithRefsElement = JayElement<CollectionWithRefsViewState, CollectionWithRefsRefs>

export declare function render(viewState: CollectionWithRefsViewState): CollectionWithRefsElement

