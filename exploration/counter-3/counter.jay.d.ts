import { JayElement } from '@jay-framework/runtime';

interface ViewState {
    count: number;
}

export declare function render(
    viewState: ViewState,
    onNewElement: (id: string, element: HTMLElement) => void,
): JayElement<ViewState>;
