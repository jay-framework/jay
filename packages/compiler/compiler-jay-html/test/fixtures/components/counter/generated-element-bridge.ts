import { JayElement, RenderElement, HTMLElementProxy, JayContract } from '@jay-framework/runtime';
import { SecureReferencesManager, elementBridge, sandboxElement as e } from '@jay-framework/secure';

export interface CounterViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adderButton: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;
export type CounterElementRender = RenderElement<
    CounterViewState,
    CounterElementRefs,
    CounterElement
>;
export type CounterElementPreRender = [CounterElementRefs, CounterElementRender];
export type CounterContract = JayContract<CounterViewState, CounterElementRefs>;

export function render(): CounterElementPreRender {
    const [refManager, [refSubtracter, refAdderButton]] = SecureReferencesManager.forElement(
        ['subtracter', 'adderButton'],
        [],
        [],
        [],
    );
    const render = (viewState: CounterViewState) =>
        elementBridge(viewState, refManager, () => [
            e(refSubtracter()),
            e(refAdderButton()),
        ]) as CounterElement;
    return [refManager.getPublicAPI() as CounterElementRefs, render];
}
