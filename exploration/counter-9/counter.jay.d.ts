import { JayElement } from '@jay-framework/runtime';

interface ViewState {
    count: number;
}

interface ElementProxy {
    onclick(handler: (e: Event) => void);
}

interface CounterEvents {
    byId(id: string): ElementProxy;
}
export declare function render(viewState: ViewState): JayElement<ViewState> & CounterEvents;
