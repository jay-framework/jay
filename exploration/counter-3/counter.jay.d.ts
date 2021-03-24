import {JayElement} from "jay-runtime";

interface ViewState {
  count: number,
}

export declare function render(viewState: ViewState,
                               onNewElement: (id: string, element: HTMLElement) => void): JayElement<ViewState>
