import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

interface ViewState {
  count: number
}

export interface CounterElement extends JayElement<ViewState> {
  subtracter: HTMLElement,
  adder: HTMLElement
}

export function render(viewState: ViewState): CounterElement {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
      e('div', {}, [
        e('button', {ref: 'subtracter'}, ['-'], context),
        e('span', {style: {cssText: 'margin: 0 16px'}}, [dt(context, vs => vs.count)]),
        e('button', {ref: 'adder'}, ['+'], context)
      ])) as CounterElement;
}
