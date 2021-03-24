import {JayElement} from "jay-runtime";

export interface WithRefs {
  refs: Refs;
}


interface ViewState {
  count: number,
}

interface Refs {
  dec: HTMLElement,
  inc: HTMLElement,
  count: HTMLElement
}

export declare function render(viewState: ViewState): JayElement<ViewState> & WithRefs
