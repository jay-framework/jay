import {JayElement, element as e, dynamicText as dt, dynamicAttribute as da, ConstructContext, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

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

export function render(viewState: CounterViewState, options?: RenderElementOptions): CounterElement {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {}, [
            e('div', {"data-id": da(vs => `${vs.id}-title`)}, [dt(vs => vs.title)]),
            e('div', {}, [
                e('button', {"data-id": da(vs => `${vs.id}-sub`), ref: 'subtracter'}, ['-']),
                e('span', {"data-id": da(vs => `${vs.id}-count`), style: {cssText: 'margin: 0 16px'}}, [dt(vs => vs.count)]),
                e('button', {"data-id": da(vs => `${vs.id}-add`), ref: 'adder'}, ['+'])
            ])
        ]), options);
}