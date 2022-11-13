import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, RenderElementOptions} from "jay-runtime";

export interface Thing {
  name: string,
  completed: boolean,
  cost: number,
  id: string
}

export interface CollectionsViewState {
  title: string,
  things: Array<Thing>
}

export interface CollectionsRefs {}

export type CollectionsElement = JayElement<CollectionsViewState, CollectionsRefs>

export function render(viewState: CollectionsViewState, options?: RenderElementOptions): CollectionsElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('h1', {}, [dt(vs => vs.title)]),
      de('div', {}, [
        forEach(vs => vs.things, (vs1: Thing) => {
          return e('div', {}, [
            e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}}, [dt(vs => vs.name)]),
            e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}}, [dt(vs => vs.completed)]),
            e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}}, [dt(vs => vs.cost)])
          ])}, 'id')
      ])
    ]), options);
}

