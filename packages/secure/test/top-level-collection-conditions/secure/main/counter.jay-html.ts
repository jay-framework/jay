import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
} from 'jay-runtime';

export interface CounterViewState {
    title: string;
    count: number;
    id: string;
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

export function render(options?: RenderElementOptions): CounterElementPreRender {
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
                e('div', { 'data-id': da((vs) => `${vs.id}-title`) }, [dt((vs) => vs.title)]),
                e('div', {}, [
                    e('button', { 'data-id': da((vs) => `${vs.id}-sub`) }, ['-'], subtracter()),
                    e(
                        'span',
                        {
                            'data-id': da((vs) => `${vs.id}-count`),
                            style: { cssText: 'margin: 0 16px' },
                        },
                        [dt((vs) => vs.count)],
                    ),
                    e('button', { 'data-id': da((vs) => `${vs.id}-add`) }, ['+'], adder()),
                ]),
            ]);
        }) as CounterElement;
    return [refManager.getPublicAPI() as CounterElementRefs, render];
}
