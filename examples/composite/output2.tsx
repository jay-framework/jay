import {element as e} from '../../lib/element2';

interface ViewState {
    text: string
    text2: string
}

export default function render(viewState: ViewState) {
    return e('div', {}, [
        e('div', {}, [viewState.text], viewState, viewState.text,
            (elem, newViewState, state) => {
                if (state !== newViewState.text)
                    elem.textContent = newViewState.text;
                return state;
            }),
        e('div', {}, ['static']),
        e('div', {}, [viewState.text2], viewState, viewState.text2,
            (elem, newViewState, state) => {
                if (state !== newViewState.text2)
                    elem.textContent = newViewState.text2;
                return state;
            })

    ]);
}

