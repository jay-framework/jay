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
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
    e('div', {}, [
      e('h1', {}, [dt(context, vs => vs.title)]),
      de('div', {}, [
        forEach(vs => vs.items, (vs1: Item) => {
          const cx1 = context.forItem(vs1);
          return e('div', {}, [
            e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}, ref: 'name'}, [dt(cx1, vs => vs.name)], cx1),
            e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}, ref: 'completed'}, [dt(cx1, vs => vs.completed)], cx1),
            e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}, ref: 'cost'}, [dt(cx1, vs => vs.cost)], cx1),
            e('button', {style: {cssText: 'border:1px blue; background: darkblue; color: white; display: inline-block;'}, ref: 'done'}, ['done'], cx1)
          ])}, 'id')
      ], context)
    ])) as CollectionWithRefsElement;
}

