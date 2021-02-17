import {element as e, dynamicText as dt} from 'jay-runtime';

interface ViewState {
    text: string
}

export default function render(viewState: ViewState) {
    return e('div', {}, [dt(viewState, vs => vs.text)]);
}

