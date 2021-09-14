import {JayElement, element as e, dynamicText as dt, dynamicAttribute as da, ConstructContext} from "jay-runtime";

interface ViewState {
  text: string,
  text2: string,
  text3: string,
  bool1: boolean
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {style: {cssText: 'background: red;'}}, [dt(vs => vs.text)]),
      e('div', {"data-attribute": 'a value'}, ['static']),
      e('input', {value: 'some value'}, []),
      e('input', {id: 'abc', value: da(vs => vs.text2)}, []),
      e('label', {htmlFor: 'abc'}, []),
      e('div', {className: 'main second'}, [dt(vs => vs.text3)]),
      e('div', {className: da(vs => `${vs.bool1?'main':''}`)}, [dt(vs => vs.text3)]),
      e('div', {className: da(vs => `${vs.bool1?'main':'second'}`)}, [dt(vs => vs.text3)])
    ]));
}