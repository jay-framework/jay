import {
    JayElement,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
} from '@jay-framework/runtime';

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
export type CompElementRender = RenderElement<CompViewState, CompElementRefs, CompElement>;
export type CompElementPreRender = [CompElementRefs, CompElementRender];

export declare function render(options?: RenderElementOptions): CompElementPreRender;
