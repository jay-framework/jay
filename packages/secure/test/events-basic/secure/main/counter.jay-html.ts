import {
    JayElement,
    element as e,
    dynamicText as dt,
    ConstructContext,
    HTMLElementProxy,
    elemRef as er,
    RenderElementOptions,
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

export function render(
    viewState: CounterViewState,
    options?: RenderElementOptions,
): CounterElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            e('div', {}, [
                e('div', { 'data-id': 'title' }, [dt((vs) => vs.title)]),
                e('div', {}, [
                    e('button', { 'data-id': 'sub' }, ['-'], er('subtracter')),
                    e('span', { 'data-id': 'count', style: { cssText: 'margin: 0 16px' } }, [
                        dt((vs) => vs.count),
                    ]),
                    e('button', { 'data-id': 'add' }, ['+'], er('adder')),
                ]),
            ]),
        options,
    );
}
