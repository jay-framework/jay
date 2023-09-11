import {HTMLElementProxy, JayElement} from "jay-runtime";
import {elementBridge, elemRef, sandboxElement as e} from "jay-secure";

export interface CounterViewState {
    count: number
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>,
    adder: HTMLElementProxy<CounterViewState, HTMLButtonElement>
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>

export function render(viewState: CounterViewState): CounterElement {
    return elementBridge(viewState, () => [
        e(elemRef('subtracter')),
        e(elemRef('adder'))
    ]);
}