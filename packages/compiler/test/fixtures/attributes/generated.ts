import {JayElement, element as e, dynamicText as dt, dynamicAttribute as da, ConstructContext} from "jay-runtime";

interface ViewState {
  text: string,
  text2: string,
  text3: string,
  bool1: boolean
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
    e('div', {}, [
      e('div', {style: {cssText: 'background: red;'}}, [dt(context, vs => vs.text)]),
      e('div', {"data-attribute": 'a value'}, ['static']),
      e('input', {value: 'some value'}, []),
      e('input', {value: da(context.currData, vs => vs.text2)}, []),
      e('div', {className: 'main second'}, [dt(context, vs => vs.text3)]),
      e('div', {className: da(context.currData, vs => `${vs.bool1?'main':''}`)}, [dt(context, vs => vs.text3)]),
      e('div', {className: da(context.currData, vs => `${vs.bool1?'main':'second'}`)}, [dt(context, vs => vs.text3)])
    ]));
}