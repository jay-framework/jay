import {
  dynamicElement as de,
  element as e,
  forEach,
  JayElement,
  dynamicText as dt,
} from '../../lib/element.js';

interface Item {
  name: string;
  completed: boolean;
  cost: number;
  id: string;
}

interface ViewState {
  items: Array<Item>;
  title: string;
}

export default function render(viewState: ViewState): JayElement<ViewState> {
  const createDiv = (item: Item) => {
    return e('div', {}, [
      e('span', { style: { cssText: 'color:green; width: 100px; display: inline-block;' } }, [
        dt(item, (item) => item.name),
      ]),
      e('span', { style: { cssText: 'color:red; width: 100px; display: inline-block;' } }, [
        dt(item, (item) => (item.completed ? 'yes' : 'no')),
      ]),
      e('span', { style: { cssText: 'color:blue; width: 100px; display: inline-block;' } }, [
        dt(item, (item) => item.cost.toString()),
      ]),
    ]);
  };

  return e(
    'div',
    {},
    [
      e('h1', {}, [dt(viewState, (vs) => vs.title)]),
      de('div', {}, [forEach((vs) => vs.items, createDiv, 'id')], viewState),
    ],
    viewState
  );
}
