import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, DynamicReference} from "jay-runtime";

interface Item {
  name: string,
  completed: boolean,
  cost: number,
  id: string
}

interface ViewState {
  title: string,
  items: Array<Item>
}

export interface CollectionWithRefsElement extends JayElement<ViewState> {
  name: DynamicReference<Item>,
  completed: DynamicReference<Item>,
  cost: DynamicReference<Item>,
  done: DynamicReference<Item>
}

export function render(viewState: ViewState): CollectionWithRefsElement {
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
    ])) as CollectionWithRefsElement;
}

