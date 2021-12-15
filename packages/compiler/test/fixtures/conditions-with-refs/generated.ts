import {JayElement, element as e, dynamicText as dt, conditional as c, dynamicElement as de, ConstructContext} from "jay-runtime";

export interface ConditionsWithRefsViewState {
  text1: string,
  text2: string,
  cond: boolean
}

export interface ConditionsWithRefsRefs {
  text1: HTMLDivElement,
  text2: HTMLSpanElement
}

export type ConditionsWithRefsElement = JayElement<ConditionsWithRefsViewState, ConditionsWithRefsRefs>

export function render(viewState: ConditionsWithRefsViewState): ConditionsWithRefsElement {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      c(vs => vs.cond,
        e('div', {style: {cssText: 'color:red'}, ref: 'text1'}, [dt(vs => vs.text1)])
      ),
      c(vs => !vs.cond,
        e('div', {style: {cssText: 'color:green'}}, [
          e('span', {ref: 'text2'}, [dt(vs => vs.text2)])
        ])
      )
    ]));
}

