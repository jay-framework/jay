import {JayElement, element as e, dynamicText as dt, conditional as c, dynamicElement as de, ConstructContext} from "jay-runtime";

export enum Cond {
  one,
  two,
  three
}

export interface ConditionsWithEnumViewState {
  text1: string,
  text2: string,
  text3: string,
  cond: Cond
}

export interface ConditionsWithEnumRefs {}

export type ConditionsWithEnumElement = JayElement<ConditionsWithEnumViewState, ConditionsWithEnumRefs>

export function render(viewState: ConditionsWithEnumViewState): ConditionsWithEnumElement {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      c(vs => vs.cond === Cond.one,
        e('div', {style: {cssText: 'color:red'}}, [dt(vs => vs.text1)])
      ),
      c(vs => vs.cond === Cond.two,
        e('div', {style: {cssText: 'color:red'}}, [dt(vs => vs.text2)])
      ),
      c(vs => vs.cond !== Cond.one,
        e('div', {style: {cssText: 'color:green'}}, [dt(vs => vs.text3)])
      )
    ]));
}

