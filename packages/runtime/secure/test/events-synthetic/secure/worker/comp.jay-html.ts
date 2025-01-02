import {
    JayElement,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
} from 'jay-runtime';
import { elementBridge, SecureReferencesManager } from '../../../../lib/';
import { sandboxElement as e, sandboxForEach as forEach } from '../../../../lib/';

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
    buttonExec$: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    input: HTMLElementProxy<CompViewState, HTMLInputElement>;
    itemButton: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
    itemInput: HTMLElementCollectionProxy<Item, HTMLInputElement>;
}

export type CompElement = JayElement<CompViewState, CompElementRefs>;
export type CompElementRender = RenderElement<CompViewState, CompElementRefs, CompElement>;
export type CompElementPreRender = [CompElementRefs, CompElementRender];

export function render(options?: RenderElementOptions): CompElementPreRender {
    const [refManager, [result, button, buttonExec, input, itemButton, itemInput]] =
        SecureReferencesManager.forElement(
            ['result', 'button', 'buttonExec', 'input'],
            ['itemButton', 'itemInput'],
            [],
            [],
        );
    const render = (viewState: CompViewState) =>
        elementBridge(viewState, refManager, () => {
            return [
                e(result()),
                e(button()),
                e(buttonExec()),
                e(input()),
                forEach(
                    (viewState: CompViewState) => viewState.items,
                    'id',
                    () => [e(itemButton()), e(itemInput())],
                ),
            ];
        }) as unknown as CompElement;
    return [refManager.getPublicAPI() as CompElementRefs, render];
}
