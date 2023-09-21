import { JayElement } from 'jay-runtime';

interface ViewState {
    count: number;
}

interface ElementProxy {
    onclick(handler: (e: Event) => void);
}

interface CounterEvents {
    dec: ElementProxy;
    inc: ElementProxy;
}
export declare function render(viewState: ViewState): JayElement<ViewState> & CounterEvents;
