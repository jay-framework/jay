import {element as e} from '../element2';

interface ViewState {
    text: string
}

export default function render(viewState: ViewState) {
    return e('div', {}, [viewState.text], viewState,
        (elem, newViewState, oldViewState) => {
            if (oldViewState.text !== newViewState.text)
                elem.textContent = newViewState.text;
        });
}

