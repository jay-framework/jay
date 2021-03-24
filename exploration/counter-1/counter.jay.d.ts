import {JayElement} from "jay-runtime";

export interface WithEvents {
  events: Events;
}


interface ViewState {
  count: number,
}

interface Events {
  onDec(callback: (count: number) => void)
  onInc(callback: (count: number) => void)
}

export declare function render(viewState: ViewState): JayElement<ViewState> & WithEvents

