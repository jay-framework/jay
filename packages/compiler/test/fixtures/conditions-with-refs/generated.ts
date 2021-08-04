import {JayElement, element as e, dynamicText as dt, conditional as c, dynamicElement as de, ConstructContext} from "jay-runtime";

interface ViewState {
  text1: string,
  text2: string,
  cond: boolean
}

export interface ConditionsWithRefsElement extends JayElement<ViewState> {
  text1: HTMLElement,
  text2: HTMLElement
}

export function render(viewState: ViewState): ConditionsWithRefsElement {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
    de('div', {}, [
      c(vs => vs.cond,
        e('div', {style: {cssText: 'color:red'}, ref: 'text1'}, [dt(context, vs => vs.text1)], context)
      ),
      c(vs => !vs.cond,
        e('div', {style: {cssText: 'color:green'}}, [e('span', {ref: 'text2'}, [dt(context, vs => vs.text2)], context)])
      )
    ], context)) as ConditionsWithRefsElement;
}

