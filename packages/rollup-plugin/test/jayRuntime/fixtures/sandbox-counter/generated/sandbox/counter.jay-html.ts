import { JayElement, HTMLElementProxy } from 'jay-runtime';
import { elementBridge, sandboxElement as e, elemRef as er } from 'jay-secure';

export interface CounterViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adderButton: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;

export function render(viewState: CounterViewState): CounterElement {
    return elementBridge(viewState, () => [e(er('subtracter')), e(er('adderButton'))]);
}
