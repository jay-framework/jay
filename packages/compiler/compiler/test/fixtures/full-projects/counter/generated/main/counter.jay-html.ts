import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

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

export function render(options?: RenderElementOptions): CounterElementPreRender {
    const [refManager, [refSubtracter, refAdderButton]] = ReferencesManager.for(
        options,
        ['subtracter', 'adderButton'],
        [],
        [],
        [],
    );
    const render = (viewState: CounterViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('button', {}, ['-'], refSubtracter()),
                e('span', { style: { cssText: 'margin: 0 16px' } }, [dt((vs) => vs.count)]),
                e('button', {}, ['+'], refAdderButton()),
            ]),
        ) as CounterElement;
    return [refManager.getPublicAPI() as CounterElementRefs, render];
}
