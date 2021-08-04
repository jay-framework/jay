import {JayElement} from "jay-runtime";

interface Thing {
  name: string,
  completed: boolean,
  cost: number,
  id: string
}

interface ViewState {
  title: string,
  things: Array<Thing>
}

export declare function render(viewState: ViewState): JayElement<ViewState>

