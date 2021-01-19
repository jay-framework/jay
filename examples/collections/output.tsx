import {
    dynamicElement as de,
    element as e,
    forEach,
    JayElement,
    updateTextContent as uTContent
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
            e('span', {style: {cssText: 'color:green'}}, [item.name]),
            e('span', {style: {cssText: 'color:red'}}, [item.completed ? 'yes' : 'no']),
            e('span', {style: {cssText: 'color:blue'}}, [item.cost.toString()])
        ]);
    };

    return e('div', {}, [
        e('h1', {}, [viewState.title], viewState, viewState.title, uTContent(vs => vs.title)),
        de('div', {}, [
            forEach(vs => vs.items, createDiv, 'id')
        ], viewState)
    ], viewState);
}

