import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext} from "jay-runtime";

interface Thing {
  name: string,
  completed: boolean,
  cost: number,
  id: string
}

interface ViewState {
  title: string,
  things: Array<Thing>
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
    e('div', {}, [
      e('h1', {}, [dt(context, vs => vs.title)]),
      de('div', {}, [
        forEach(vs => vs.things, (vs1: Thing) => {
          const cx1 = context.forItem(vs1);
          return e('div', {}, [
            e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}}, [dt(cx1, vs => vs.name)]),
            e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}}, [dt(cx1, vs => vs.completed)]),
            e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}}, [dt(cx1, vs => vs.cost)])
          ])}, 'id')], context)
    ]));
}

