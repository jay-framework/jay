import {JayElement, element as e, dynamicText as dt, dynamicAttribute as da, dynamicElement as de, forEach, ConstructContext, HTMLElementCollectionProxy, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {elementBridge, proxyRef} from "../../../../lib/sandbox/sandbox-bridge";
import {CounterElement} from "../../../events-basic/secure/worker/counter.jay.html";

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
        proxyRef('button'),
        proxyRef('input'),
        proxyRef('itemButton'),
        proxyRef('itemInput'),
    ]) as unknown as CompElement;
}