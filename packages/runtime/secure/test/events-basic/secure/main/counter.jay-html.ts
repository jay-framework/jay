import {
    JayElement,
    element as e,
    dynamicText as dt,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
} from 'jay-runtime';

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
export type CounterPreRender = [CounterElementRefs, CounterElementRender];

export function render(options?: RenderElementOptions): CounterPreRender {
    const [refManager, [subtracter, adder]] = ReferencesManager.for(
        options,
        ['subtracter', 'adder'],
        [],
        [],
        [],
    );
    const render = (viewState: CounterViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return e('div', {}, [
                e('div', { 'data-id': 'title' }, [dt((vs) => vs.title)]),
                e('div', {}, [
                    e('button', { 'data-id': 'sub' }, ['-'], subtracter()),
                    e('span', { 'data-id': 'count', style: { cssText: 'margin: 0 16px' } }, [
                        dt((vs) => vs.count),
                    ]),
                    e('button', { 'data-id': 'add' }, ['+'], adder()),
                ]),
            ]);
        }) as CounterElement;
    return [refManager.getPublicAPI() as CounterElementRefs, render];
}
