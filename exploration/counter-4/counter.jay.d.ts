import {JayElement} from "jay-runtime";


interface WithEvents {
  addEventListener(id: string, event: string, callback: (Event) => void)
}

interface ViewState {
  count: number,
}

export declare function render(viewState: ViewState): WithEvents & JayElement<ViewState>
