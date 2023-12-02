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
    button: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    buttonExec: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    input: HTMLElementProxy<CompViewState, HTMLInputElement>;
    itemButton: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
    itemInput: HTMLElementCollectionProxy<Item, HTMLInputElement>;
}

export type CompElement = JayElement<CompViewState, CompElementRefs>;

export declare function render(
    viewState: CompViewState,
    options?: RenderElementOptions,
): CompElement;
