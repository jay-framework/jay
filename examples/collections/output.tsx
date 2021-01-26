import {
    dynamicElement as de,
    element as e,
    forEach,
    JayElement,
    textElement as text
} from '../../lib/element.js';

interface Item {
    name: string,
    completed: boolean,
    cost: number,
    id: string
}

interface ViewState {
    items: Array<Item>,
    title: string
}

export default function render(viewState: ViewState): JayElement<ViewState> {

    const createDiv = (item: Item) => {
        return e('div', {}, [
            text('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}},
                item, item => item.name),
            text('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}},
                item, item => item.completed ? 'yes' : 'no'),
            text('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}},
                item, item => item.cost.toString())
        ]);
    };

    return e('div', {}, [
        text('h1', {}, viewState, vs => vs.title),
        de('div', {}, [
            forEach(vs => vs.items, createDiv, 'id')
        ], viewState)
    ], viewState);
}

