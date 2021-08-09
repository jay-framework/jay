import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

interface ViewState {
  text: string,
  text2: string,
  text3: string
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
    e('div', {}, [
      e('div', {style: {cssText: 'background: red;'}}, [dt(context, vs => vs.text)]),
      e('div', {"data-attribute": 'a value'}, ['static']),
      e('div', {value: 'second value'}, [dt(context, vs => vs.text2)]),
      e('div', {className: 'main second'}, [dt(context, vs => vs.text3)])
    ]));
}