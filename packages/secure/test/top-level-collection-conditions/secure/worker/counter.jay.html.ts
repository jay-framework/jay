import {HTMLElementProxy, JayElement} from "jay-runtime";
import {elementBridge} from "../../../../lib/sandbox/sandbox-bridge";
import {sandboxElement as e} from "../../../../lib/sandbox/sandbox-element";

export interface CounterViewState {
    title: string,
    count: number,
    id: string
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>,
    adder: HTMLElementProxy<CounterViewState, HTMLButtonElement>
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>

export function render(viewState: CounterViewState): CounterElement {
    return elementBridge(viewState, () => [
        e('subtracter'),
        e('adder')
    ]) as unknown as CounterElement;
}