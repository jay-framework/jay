import {JayElement} from "jay-runtime";

interface ViewState {
  count: number,
}

interface CounterEvents {
  byId(id: string): GlobalEventHandlers;
}
export declare function render(viewState: ViewState): JayElement<ViewState> & CounterEvents
