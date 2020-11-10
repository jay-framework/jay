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
    };

    // const reverseRenderChildren = () => {
    //     let childs = [...div1.childNodes]
    //     return childs.map(child => {
    //         return {name: child.childNodes[0].textContent,
    //             completed: child.childNodes[1].textContent === 'yes',
    //             cost: Number(child.childNodes[2].textContent)}
    //     })
    // };

    const reconsileCollection = (items) => {
        // console.log('***** reconsileCollection', lastViewState.items, items, reverseRenderChildren())
        let instructions = listCompare(lastViewState.items, items, 'id');

        instructions.forEach(instruction => {
            if (instruction.action === ITEM_ADDED) {
                group1.ensureNode(createDiv(instruction.item), instruction.pos)
                // console.log('add', instruction.pos);
            }
            else if (instruction.action === ITEM_REMOVED) {
                group1.removeNodeAt(instruction.pos)
                // console.log('remove', instruction.pos);
            }
            else {
                group1.moveNode(instruction.fromPos, instruction.pos)
                // console.log('move', instruction.fromPos, instruction.pos);
            }
            // console.log('in loop', reverseRenderChildren());
        });

        // let reverseRender = reverseRenderChildren();
        // let match = items.length === reverseRender.length;
        // let i =0;
        // while (i < items.length && i < reverseRender.length) {
        //     match = match &&
        //         items[i].name === reverseRender[i].name &&
        //         items[i].completed === reverseRender[i].completed &&
        //         items[i].cost === reverseRender[i].cost;
        //     i = i+1;
        // }
        // if (!match) {
        //     console.log(lastViewState.items, items, instructions, reverseRender)
        //     debugger;
        // }
        // console.log(lastViewState.items, items, instructions, reverseRender)
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

