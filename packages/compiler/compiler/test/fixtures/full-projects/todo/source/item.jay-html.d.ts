import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from 'jay-runtime';

export interface ItemViewState {
    title: string;
    isEditing: boolean;
    editText: string;
    isCompleted: boolean;
}

export interface ItemElementRefs {
    completed: HTMLElementProxy<ItemViewState, HTMLInputElement>;
    label: HTMLElementProxy<ItemViewState, HTMLLabelElement>;
    button: HTMLElementProxy<ItemViewState, HTMLButtonElement>;
    title: HTMLElementProxy<ItemViewState, HTMLInputElement>;
}

export type ItemElement = JayElement<ItemViewState, ItemElementRefs>;
export type ItemElementRender = RenderElement<ItemViewState, ItemElementRefs, ItemElement>;
export type ItemElementPreRender = [ItemElementRefs, ItemElementRender];
export type ItemContract = JayContract<ItemViewState, ItemElementRefs>;

export declare function render(options?: RenderElementOptions): ItemElementPreRender;
