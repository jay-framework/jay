import {element as e} from '../../lib/element2';

interface ViewState {
    text: string
}

export default function render(viewState: ViewState) {
    return e('div', {}, [viewState.text], viewState, viewState.text,
        (elem, newViewState, state) => {
            if (state !== newViewState.text)
                elem.textContent = newViewState.text;
            return newViewState.text
        });
}

