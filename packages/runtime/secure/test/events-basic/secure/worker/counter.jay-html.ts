import { HTMLElementProxy, JayElement, RenderElement } from '@jay-framework/runtime';
import { elementBridge, SecureReferencesManager } from '../../../../lib/';
import { sandboxElement as e } from '../../../../lib/';

export interface CounterViewState {
    title: string;
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adder: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;
export type CounterElementRender = RenderElement<
    CounterViewState,
    CounterElementRefs,
    CounterElement
>;
export type CounterElementPreRender = [refs: CounterElementRefs, CounterElementRender];

export function render(): CounterElementPreRender {
    const [refManager, [subtracter, adder]] = SecureReferencesManager.forElement(
        ['subtracter', 'adder'],
        [],
        [],
        [],
    );
    const render = (viewState: CounterViewState) =>
        elementBridge(viewState, refManager, () => [e(subtracter()), e(adder())]) as CounterElement;
    return [refManager.getPublicAPI() as CounterElementRefs, render];
}
