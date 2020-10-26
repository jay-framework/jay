import {Kindergarten} from '../kindergarden.js'

interface ViewState {
    text1: string,
    text2: string,
    cond: boolean
}

export default function render(viewState: ViewState) {
    let lastViewState = {text1: '', text2: '', cond: false};
    let root = document.createElement('div');
    let rootKindergarten = new Kindergarten(root)
    let group1 = rootKindergarten.newGroup();
    let group2 = rootKindergarten.newGroup();
    let div1 = document.createElement('div');
    let div2 = document.createElement('div');
    div1.style.cssText = "color:red";
    div2.style.cssText = "color:green";

    const updatediv1 = (text) => {
        if (lastViewState.text1 != text)
            div1.textContent = text;
    };

    const updatediv2 = (text) => {
        if (lastViewState.text2 != text)
            div2.textContent = text;
    };

    const rerender = (newViewState) => {
        if (newViewState.cond) {
            group1.ensureNode(div1);
            group2.removeNode(div2);
            updatediv1(newViewState.text1);
        }
        else {
            group1.removeNode(div1);
            group2.ensureNode(div2);
            updatediv2(newViewState.text2);
        }
        lastViewState = newViewState
    };

    rerender(viewState);

    return {
        dom: root,
        update: rerender
    }
}

