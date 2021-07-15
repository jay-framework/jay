import {JayElement, element as e, dynamicText as dt, conditional as c, dynamicElement as de, ConstructContext} from "jay-runtime";

interface ViewState {
  text1: string,
  text2: string,
  cond: boolean
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
      de('div', {}, [
        c(vs => vs.cond,
            e('div', {style: {cssText: 'color:red'}}, [dt(context, vs => vs.text1)])
        ),
        c(vs => !vs.cond,
            e('div', {style: {cssText: 'color:green'}}, [dt(context, vs => vs.text2)])
        )
      ], context));
}

