import {JayElement} from "jay-runtime";

interface ViewState {
  count: number,
}

interface BindEvents {
  on(event: string, callback: () => void): BindEvents
}

export declare function eventsFor(id: string): BindEvents;
export declare function render(viewState: ViewState, events: Array<BindEvents>): JayElement<ViewState>
