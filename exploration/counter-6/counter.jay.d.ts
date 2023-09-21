import { JayElement } from 'jay-runtime';

interface ViewState {
    count: number;
}

export interface JayCounter {
    onDec(callback: (count: number) => void);
    onInc(callback: (count: number) => void);
}

export declare function render(viewState: ViewState): JayElement<ViewState> & JayCounter;
