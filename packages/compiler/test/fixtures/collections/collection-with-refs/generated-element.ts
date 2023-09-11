import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, HTMLElementCollectionProxy, elemCollectionRef as ecr, RenderElementOptions} from "jay-runtime";

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

export interface CollectionWithRefsElementRefs {
  name: HTMLElementCollectionProxy<Item, HTMLSpanElement>,
  completed: HTMLElementCollectionProxy<Item, HTMLSpanElement>,
  cost: HTMLElementCollectionProxy<Item, HTMLSpanElement>,
  done: HTMLElementCollectionProxy<Item, HTMLButtonElement>
}

export type CollectionWithRefsElement = JayElement<CollectionWithRefsViewState, CollectionWithRefsElementRefs>

export function render(viewState: CollectionWithRefsViewState, options?: RenderElementOptions): CollectionWithRefsElement {
  return ConstructContext.withRootContext(viewState, () => {
    const refName = ecr('name');
    const refCompleted = ecr('completed');
    const refCost = ecr('cost');
    const refDone = ecr('done');
    return e('div', {}, [
      e('h1', {}, [dt(vs => vs.title)]),
      de('div', {}, [
        forEach(vs => vs.items, (vs1: Item) => {
          return e('div', {}, [
            e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}}, [dt(vs => vs.name)], refName()),
            e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}}, [dt(vs => vs.completed)], refCompleted()),
            e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}}, [dt(vs => vs.cost)], refCost()),
            e('button', {style: {cssText: 'border:1px blue; background: darkblue; color: white; display: inline-block;'}}, ['done'], refDone())
          ])}, 'id')
      ])
    ])}, options);
}

