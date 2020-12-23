import {element as e} from '../element2';

interface ViewState {
    text: string
}

export default function render(viewState: ViewState) {
    // let lastViewState = {text: ''};
    return e('div', {}, [viewState.text], viewState,
        (elem, newViewState, oldViewState) => {
            if (oldViewState.text !== newViewState.text)
                elem.textContent = newViewState.text;
        });

    // const updateRootText = (text) => {
    //     root.textContent = text;
    // };
    //
    // const rerender = (newViewState) => {
    //     if (lastViewState.text !== newViewState.text)
    //         updateRootText(newViewState.text);
    //     lastViewState = newViewState
    // };

    // return {
    //     dom: root,
    //     update: rerender
    // }
}

