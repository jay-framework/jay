import {JayElement, DynamicReference} from "jay-runtime";

interface Item {
  name: string,
  completed: boolean,
  cost: number,
  id: string
}

interface ViewState {
  title: string,
  items: Array<Item>
}

export interface CollectionWithRefsElement extends JayElement<ViewState> {
  name: DynamicReference<Item>,
  completed: DynamicReference<Item>,
  cost: DynamicReference<Item>,
  done: DynamicReference<Item>
}

export declare function render(viewState: ViewState): CollectionWithRefsElement

