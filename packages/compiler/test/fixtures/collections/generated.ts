import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach} from "jay-runtime";

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

export function render(viewState: ViewState): JayElement<ViewState> {
  return e('div', {}, [
    e('h1', {}, [dt(viewState, vs => vs.title)]),
    de('div', {}, [forEach(vs => vs.items, (vs1: Item) => {
      return e('div', {}, [
        e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}}, [dt(vs1, vs => vs.name)]),
        e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}}, [dt(vs1, vs => vs.completed)]),
        e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}}, [dt(vs1, vs => vs.cost)])
      ])}, 'id')], viewState)
  ]);
}

