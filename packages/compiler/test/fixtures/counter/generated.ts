import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

export interface CounterViewState {
  count: number
}

export interface CounterRefs {
  subtracter: HTMLButtonElement,
  adderButton: HTMLButtonElement
}

export type CounterElement = JayElement<CounterViewState, CounterRefs>

export function render(viewState: CounterViewState): CounterElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('button', {ref: 'subtracter'}, ['-']),
      e('span', {style: {cssText: 'margin: 0 16px'}}, [dt(vs => vs.count)]),
      e('button', {ref: 'adderButton'}, ['+'])
    ]));
}
