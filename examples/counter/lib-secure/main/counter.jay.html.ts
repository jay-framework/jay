import {JayElement, element as e, dynamicText as dt, ConstructContext, HTMLElementProxy, elemRef as er, RenderElementOptions} from "jay-runtime";

export interface CounterViewState {
  count: number
}

export interface CounterElementRefs {
  subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>,
  adder: HTMLElementProxy<CounterViewState, HTMLButtonElement>
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>

export function render(viewState: CounterViewState, options?: RenderElementOptions): CounterElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('button', {}, ['-'], er('subtracter')),
      e('span', {style: {cssText: 'margin: 0 16px'}}, [dt(vs => vs.count)]),
      e('button', {}, ['+'], er('adder'))
    ]), options);
}