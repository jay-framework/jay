import { JayElement } from '@jay-framework/runtime';

interface WithEvents {
    addEventListener(id: string, event: string, callback: (Event) => void);
}

interface ViewState {
    count: number;
}

export declare function render(viewState: ViewState): WithEvents & JayElement<ViewState>;
