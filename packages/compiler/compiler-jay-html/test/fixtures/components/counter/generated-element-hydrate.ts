import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';

export interface CounterViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adderButton: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterSlowViewState = {};
export type CounterFastViewState = {};
export type CounterInteractiveViewState = CounterViewState;

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;
export type CounterElementRender = RenderElement<
    CounterViewState,
    CounterElementRefs,
    CounterElement
>;
export type CounterElementPreRender = [CounterElementRefs, CounterElementRender];
export type CounterContract = JayContract<
    CounterViewState,
    CounterElementRefs,
    CounterSlowViewState,
    CounterFastViewState,
    CounterInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): CounterElementPreRender {
    const [refManager, [refSubtracter, refAdderButton]] = ReferencesManager.for(
        options,
        ['subtracter', 'adderButton'],
        [],
        [],
        [],
    );
    const render = (viewState: CounterViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptElement('subtracter', {}, [], refSubtracter()),
                adoptText('1', (vs) => vs.count),
                adoptElement('adderButton', {}, [], refAdderButton()),
            ]),
        ) as CounterElement;
    return [refManager.getPublicAPI() as CounterElementRefs, render];
}
