import {JayElement, element as e, dynamicText as dt, conditional as c, dynamicElement as de, ConstructContext} from "jay-runtime";

interface ViewState {
  text1: string,
  text2: string,
  cond: boolean
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      c(vs => vs.cond,
        e('div', {style: {cssText: 'color:red'}}, [dt(vs => vs.text1)])
      ),
      c(vs => !vs.cond,
        e('div', {style: {cssText: 'color:green'}}, [dt(vs => vs.text2)])
      )
    ]));
}

