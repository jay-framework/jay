import { JayElement } from '@jay-framework/runtime';

interface ViewState {
    count: number;
}

interface BindEvents {
    on(event: string, callback: () => void): BindEvents;
}

export declare function eventsFor(id: string): BindEvents;
export declare function render(
    viewState: ViewState,
    events: Array<BindEvents>,
): JayElement<ViewState>;
