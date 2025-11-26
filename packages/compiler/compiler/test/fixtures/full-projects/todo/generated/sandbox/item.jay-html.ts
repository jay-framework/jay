import { JayElement, RenderElement, HTMLElementProxy, JayContract } from '@jay-framework/runtime';
import { SecureReferencesManager, elementBridge, sandboxElement as e } from '@jay-framework/secure';

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


export type ItemSlowViewState = {};
export type ItemFastViewState = {};
export type ItemInteractiveViewState = ItemViewState;

export type ItemElement = JayElement<ItemViewState, ItemElementRefs>;
export type ItemElementRender = RenderElement<ItemViewState, ItemElementRefs, ItemElement>;
export type ItemElementPreRender = [ItemElementRefs, ItemElementRender];
export type ItemContract = JayContract<
    ItemViewState,
    ItemElementRefs,
    ItemSlowViewState,
    ItemFastViewState,
    ItemInteractiveViewState
>;

export function render(): ItemElementPreRender {
    const [refManager, [refCompleted, refLabel, refButton, refTitle]] =
        SecureReferencesManager.forElement(['completed', 'label', 'button', 'title'], [], [], []);
    const render = (viewState: ItemViewState) =>
        elementBridge(viewState, refManager, () => [
            e(refCompleted()),
            e(refLabel()),
            e(refButton()),
            e(refTitle()),
        ]) as ItemElement;
    return [refManager.getPublicAPI() as ItemElementRefs, render];
}
