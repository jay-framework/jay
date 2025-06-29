import { JayElement } from '@jay-framework/runtime';

interface ViewState {
    count: number;
}

interface CounterEvents {
    onDec(handler: (number) => void);
    onInc(handler: (number) => void);
}
export declare function render(viewState: ViewState): JayElement<ViewState> & CounterEvents;
