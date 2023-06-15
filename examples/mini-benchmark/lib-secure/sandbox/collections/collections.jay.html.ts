import {JayElement} from "jay-runtime";
import {elementBridge} from "jay-secure";

export interface Item {
  name: string,
  completed: boolean,
  cost: number,
  id: string
}

export interface CollectionsViewState {
  items: Array<Item>,
  title: string,
  numberOfItems: number
}

export interface CollectionsElementRefs {}

export type CollectionsElement = JayElement<CollectionsViewState, CollectionsElementRefs>

export function render(viewState: CollectionsViewState): CollectionsElement {
    return elementBridge(viewState, () => []);
}