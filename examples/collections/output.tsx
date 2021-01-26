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
            e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}},
                [item.name], item, item.name, uTContent(vs => vs.name)),
            e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}},
                [item.completed ? 'yes' : 'no'], item, item.completed, (elem:HTMLElement, newData:Item, state: boolean) => {
                    if (newData.completed !== state)
                        elem.textContent = item.completed ? 'yes' : 'no';
                    return newData.completed;
                }),
            e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}},
                [item.cost.toString()], item, item.cost, (elem:HTMLElement, newData:Item, state: number) => {
                    if (newData.cost !== state)
                        elem.textContent = item.cost.toString();
                    return newData.cost;
                })
        ]);
    };

    return e('div', {}, [
        e('h1', {}, [viewState.title], viewState, viewState.title, uTContent(vs => vs.title)),
        de('div', {}, [
            forEach(vs => vs.items, createDiv, 'id')
        ], viewState)
    ], viewState);
}

