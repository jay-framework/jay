import {HTMLElementProxy, JayElement} from "jay-runtime";
import {proxyRef, elementBridge} from "../../../../lib/sandbox/sandbox-bridge";

export interface CounterViewState {
    title: string,
    count: number
}

export interface CounterRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>,
    adder: HTMLElementProxy<CounterViewState, HTMLButtonElement>
}

export type CounterElement = JayElement<CounterViewState, CounterRefs>

export function render(viewState: CounterViewState): CounterElement {
    return elementBridge(viewState, [
        proxyRef('subtracter'),
        proxyRef('adder')
    ]) as unknown as CounterElement;
}