import {JayElement, HTMLElementCollectionProxy, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {DynamicRef, elementBridge, mkRef, StaticRef} from "../../../../lib/sandbox/sandbox-bridge";

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
    return elementBridge(viewState, [
        new StaticRef('button'),
        new StaticRef('input'),
        new DynamicRef((viewState: CompViewState) => viewState.items, 'id', [
            new StaticRef('itemButton'),
            new StaticRef('itemInput')
            ]
        )
    ]) as unknown as CompElement;
}