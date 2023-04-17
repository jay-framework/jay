import {JayElement, element as e, dynamicText as dt, ConstructContext, RenderElementOptions} from "jay-runtime";

export interface O1 {
  s2: string,
  n2: number
}

export interface A1 {
  s3: string,
  n3: number
}

export interface DataTypesViewState {
  s1: string,
  n1: number,
  b1: boolean,
  o1: O1,
  a1: Array<A1>
}

export interface DataTypesElementRefs {}

export type DataTypesElement = JayElement<DataTypesViewState, DataTypesElementRefs>

export function render(viewState: DataTypesViewState, options?: RenderElementOptions): DataTypesElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('span', {}, [dt(vs => vs.s1)]),
      e('span', {}, [dt(vs => vs.n1)]),
      e('span', {}, [dt(vs => vs.b1)]),
      e('span', {}, [dt(vs => vs.o1?.s2)]),
      e('span', {}, [dt(vs => vs.o1?.n2)])
    ]), options);
}