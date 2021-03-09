import {JayElement, element as e, dynamicText as dt, conditional as c, dynamicElement as de} from "jay-runtime";

interface ViewState {
  text1: string,
  text2: string,
  cond: boolean
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return de('div', {}, [
    c(vs => vs.cond,
        e('div', {style: {cssText: 'color:red'}}, [dt(viewState, vs => vs.text1)])
    ),
    c(vs => !vs.cond,
        e('div', {style: {cssText: 'color:green'}}, [dt(viewState, vs => vs.text2)])
    )
  ], viewState);
}

