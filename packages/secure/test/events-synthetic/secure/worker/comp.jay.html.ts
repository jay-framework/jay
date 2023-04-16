import {JayElement, HTMLElementCollectionProxy, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {elementBridge} from "../../../../lib/sandbox/sandbox-bridge";
import {
    sandboxElement as e,
    sandboxForEach as forEach
} from "../../../../lib/sandbox/sandbox-element";

export interface Item {
    id: string,
    text: string
}

export interface CompViewState {
    text: string,
    items: Array<Item>
}

export interface CompRefs {
    button: HTMLElementProxy<CompViewState, HTMLButtonElement>,
    input: HTMLElementProxy<CompViewState, HTMLInputElement>,
    itemButton: HTMLElementCollectionProxy<Item, HTMLButtonElement>,
    itemInput: HTMLElementCollectionProxy<Item, HTMLInputElement>
}

export type CompElement = JayElement<CompViewState, CompRefs>

export function render(viewState: CompViewState, options?: RenderElementOptions): CompElement {
    return elementBridge(viewState, () => [
        e('button'),
        e('input'),
        forEach((viewState: CompViewState) => viewState.items, 'id', () => [
            e('itemButton'),
            e('itemInput')
            ]
        )
    ], ['itemButton', 'itemInput']) as unknown as CompElement;
}