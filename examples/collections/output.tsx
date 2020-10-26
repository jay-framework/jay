import {Kindergarten} from '../kindergarden.js'
import {ITEM_ADDED, ITEM_REMOVED, listCompare} from "../list-compare.js";

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

export default function render(viewState: ViewState) {
    let lastViewState: ViewState = {items: [], title: ''};
    let root = document.createElement('div');
    let h1 = document.createElement('h1');
    root.appendChild(h1);
    let div1 = document.createElement('div');
    root.appendChild(div1);
    let rootKindergarten = new Kindergarten(div1);
    let group1 = rootKindergarten.newGroup();

    const updateH1 = (title) => {
        if (lastViewState.title !== title)
            h1.textContent = title;
    };

    const createDiv = (item: Item) => {
        let coolRoot = document.createElement('div');
        let span1 = document.createElement('span');
        span1.style.cssText = 'color:green';
        span1.textContent = item.name;
        let span2 = document.createElement('span');
        span2.style.cssText = 'color:red';
        span2.textContent = item.completed?'yes':'no';
        let span3 = document.createElement('span');
        span3.style.cssText = 'color:blue';
        span3.textContent = item.cost.toString();
        coolRoot.appendChild(span1);
        coolRoot.appendChild(span2);
        coolRoot.appendChild(span3);
        return coolRoot;
    }

    const reconsileCollection = (items) => {
        let instructions = listCompare(lastViewState.items, items, 'id');
        instructions.forEach(instruction => {
            if (instruction.action === ITEM_ADDED) {
                group1.ensureNode(createDiv(instruction.item), instruction.pos)
            }
            else if (instruction.action === ITEM_REMOVED) {

            }
            else {
                // item moved
            }
        })
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

