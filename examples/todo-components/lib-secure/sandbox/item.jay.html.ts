import {HTMLElementProxy, JayElement} from "jay-runtime";
import {elementBridge} from "jay-secure";
import {sandboxElement as e} from "jay-secure";

export interface ItemViewState {
    title: string,
    isEditing: boolean,
    editText: string,
    isCompleted: boolean
}

export interface ItemElementRefs {
    completed: HTMLElementProxy<ItemViewState, HTMLInputElement>,
    label: HTMLElementProxy<ItemViewState, HTMLLabelElement>,
    button: HTMLElementProxy<ItemViewState, HTMLButtonElement>,
    title: HTMLElementProxy<ItemViewState, HTMLInputElement>
}

export type ItemElement = JayElement<ItemViewState, ItemElementRefs>

export function render(viewState: ItemViewState): ItemElement {
    return elementBridge(viewState, () => [
        e('completed'),
        e('label'),
        e('button'),
        e('title')
    ]) as unknown as ItemElement;
}