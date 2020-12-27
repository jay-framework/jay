import {element as e} from '../element2';

interface ViewState {
    text: string
    text2: string
}

export default function render(viewState: ViewState) {
    return e('div', {}, [
        e('div', {}, [viewState.text], viewState,
            (elem, newViewState, oldViewState) => {
                if (oldViewState.text !== newViewState.text)
                    elem.textContent = newViewState.text;
            }),
        e('div', {}, ['static']),
        e('div', {}, [viewState.text2], viewState,
            (elem, newViewState, oldViewState) => {
                if (oldViewState.text2 !== newViewState.text2)
                    elem.textContent = newViewState.text2;
            })

    ]);
}

