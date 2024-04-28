import { HTMLElementProxy, JayElement } from 'jay-runtime';
import { elementBridge } from 'jay-secure'
import { sandboxElement as e } from 'jay-secure';
import { elemRef } from 'jay-secure';

export interface CounterViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adder: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;

export function render(viewState: CounterViewState): CounterElement {
    return elementBridge(viewState, () => [
        e(elemRef('subtracter')),
        e(elemRef('adder')),
    ]) as unknown as CounterElement;
}
