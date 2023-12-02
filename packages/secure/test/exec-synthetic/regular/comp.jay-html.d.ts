import {
    JayElement,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
} from 'jay-runtime';

export interface Item {
    id: string;
    text: string;
}

export interface CompViewState {
    text: string;
    items: Array<Item>;
}

export interface CompElementRefs {
    result: HTMLElementProxy<CompViewState, HTMLDivElement>;
    buttonExecGlobal: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    buttonExecElement: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    itemButtonExecElement: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
}

export type CompElement = JayElement<CompViewState, CompElementRefs>;

export declare function render(
    viewState: CompViewState,
    options?: RenderElementOptions,
): CompElement;
