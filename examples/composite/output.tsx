import {element as e, textElement as text} from '../../lib/element';

interface ViewState {
    text: string
    text2: string
}

export default function render(viewState: ViewState) {
    return e('div', {}, [
        text('div', {}, viewState, vs => vs.text),
        e('div', {}, ['static']),
        text('div', {}, viewState, vs => vs.text2)

    ]);
}

