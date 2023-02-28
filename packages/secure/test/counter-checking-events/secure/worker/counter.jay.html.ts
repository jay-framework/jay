import {HTMLElementProxy, JayElement} from "jay-runtime";
import {proxyRef, elementBridge} from "../../../../lib/worker-stub";

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
    return elementBridge('a', viewState, [
        proxyRef('subtracter', 'a'),
        proxyRef('adder', 'a')
    ]) as unknown as CounterElement;
}