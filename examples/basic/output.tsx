import {element as e, updateTextContent as uTContent} from '../../lib/element';

interface ViewState {
    text: string
}

export default function render(viewState: ViewState) {
    return e('div', {}, [viewState.text], viewState, viewState.text,
        uTContent(vs => vs.text));
}

