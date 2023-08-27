import {HTMLElementProxy, JayElement} from "jay-runtime";
import {elementBridge} from "../../../../lib/";
import {sandboxElement as e} from "../../../../lib/";
import {elemRef} from "../../../../lib/";

export interface CounterViewState {
    title: string,
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
    ]) as unknown as CounterElement;
}