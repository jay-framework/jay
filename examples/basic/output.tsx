import {textElement as text} from '../../lib/element';

interface ViewState {
    text: string
}

export default function render(viewState: ViewState) {
    return text('div', {}, viewState, vs => vs.text);
}

