import { HTMLElementProxy, JayElement, ReferencesManager, RenderElement } from 'jay-runtime';
import { elementBridge, SecureReferencesManager } from 'jay-secure';
import { sandboxElement as e } from 'jay-secure';

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
export type ItemElementPreRender = [refs: ItemElementRefs, ItemElementRender];

export function render(): ItemElementPreRender {
    const [refManager, [refCompleted, refLabel, refButton, refTitle]] =
        SecureReferencesManager.forElement(['completed', 'label', 'button', 'title'], [], [], []);
    const render = (viewState: ItemViewState) =>
        elementBridge(viewState, refManager, () => [
            e(refCompleted()),
            e(refLabel()),
            e(refButton()),
            e(refTitle()),
        ]) as unknown as ItemElement;
    return [refManager.getPublicAPI() as ItemElementRefs, render];
}
