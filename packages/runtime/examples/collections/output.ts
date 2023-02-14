import {
    dynamicElement as de,
    element as e,
    forEach,
    dynamicText as dt, ConstructContext
} from '../../lib/element.js';
import {JayElement} from "../../lib/element-types";

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

interface Refs {}

export default function render(viewState: ViewState): JayElement<ViewState, Refs> {


    return ConstructContext.withRootContext(viewState, () => {

        const createDiv = (item: Item) => {
            return e('div', {}, [
                e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}},
                    [dt<Item>(item => item.name)]),
                e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}},
                    [dt<Item>(item => item.completed ? 'yes' : 'no')]),
                e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}},
                    [dt<Item>(item => item.cost.toString())])
            ]);
        };

        return e('div', {}, [
            e('h1', {}, [dt(vs => vs.title)]),
            de('div', {}, [
                forEach(vs => vs.items, createDiv, 'id')
            ])
        ])
    })
}

