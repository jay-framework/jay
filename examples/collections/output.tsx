import {Kindergarten} from '../kindergarden.js'

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
    let lastViewState = viewState;
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

    const reconsileCollection = (items) => {
        
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

