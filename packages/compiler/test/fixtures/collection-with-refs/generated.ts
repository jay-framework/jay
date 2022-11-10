import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, HTMLElementCollectionProxy, RenderElementOptions, } from "jay-runtime";

export interface Item {
  name: string,
  completed: boolean,
  cost: number,
  id: string
}

export interface CollectionWithRefsViewState {
  title: string,
  items: Array<Item>
}

export interface CollectionWithRefsRefs {
  name: HTMLElementCollectionProxy<Item, HTMLSpanElement>,
  completed: HTMLElementCollectionProxy<Item, HTMLSpanElement>,
  cost: HTMLElementCollectionProxy<Item, HTMLSpanElement>,
  done: HTMLElementCollectionProxy<Item, HTMLButtonElement>
}

export type CollectionWithRefsElement = JayElement<CollectionWithRefsViewState, CollectionWithRefsRefs>

export function render(viewState: CollectionWithRefsViewState, options?: RenderElementOptions): CollectionWithRefsElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('h1', {}, [dt(vs => vs.title)]),
      de('div', {}, [
        forEach(vs => vs.items, (vs1: Item) => {
          return e('div', {}, [
            e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}, ref: 'name'}, [dt(vs => vs.name)]),
            e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}, ref: 'completed'}, [dt(vs => vs.completed)]),
            e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}, ref: 'cost'}, [dt(vs => vs.cost)]),
            e('button', {style: {cssText: 'border:1px blue; background: darkblue; color: white; display: inline-block;'}, ref: 'done'}, ['done'])
          ])}, 'id')
      ])
    ]), options, ['name', 'completed', 'cost', 'done']);
}

