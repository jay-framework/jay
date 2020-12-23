import {Kindergarten} from '../kindergarden.js'
import {ITEM_ADDED, ITEM_REMOVED, listCompare} from "../list-compare.js";
import {element as e} from '../element.js';

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

function applyListChanges(group, instructions, createItemElement) {
    instructions.forEach(instruction => {
        if (instruction.action === ITEM_ADDED) {
            group.ensureNode(createItemElement(instruction.item), instruction.pos)
        }
        else if (instruction.action === ITEM_REMOVED) {
            group.removeNodeAt(instruction.pos)
        }
        else {
            group.moveNode(instruction.fromPos, instruction.pos)
        }
    });
}

export default function render(viewState: ViewState) {
    let lastViewState: ViewState = {items: [], title: viewState.title};
    let h1, div1;
    let root = e('div', {}, [
        h1 = e('h1', {}, [viewState.title]),
        div1 = e('div')
    ]);
    let rootKindergarten = new Kindergarten(div1);
    let group1 = rootKindergarten.newGroup();

    const updateH1 = (title) => {
        if (lastViewState.title !== title)
            h1.textContent = title;
    };

    const createDiv = (item: Item) => {
        return e('div', {}, [
            e('span', {style: {cssText: 'color:green'}}, [item.name]),
            e('span', {style: {cssText: 'color:red'}}, [item.completed ? 'yes' : 'no']),
            e('span', {style: {cssText: 'color:blue'}}, [item.cost.toString()])
        ]);
    };

    const reconsileCollection = (items) => {
        let instructions = listCompare(lastViewState.items, items, 'id');
        applyListChanges(group1, instructions, createDiv);
    };

    const rerender = (newViewState) => {
        updateH1(newViewState.title);
        reconsileCollection(newViewState.items);
        lastViewState = newViewState
    };

    rerender(viewState);

    return {
        dom: root,
        update: rerender
    }
}

