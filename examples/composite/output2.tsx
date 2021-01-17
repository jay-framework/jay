import {element as e, updateTextContent as uTContent} from '../../lib/element2';

interface ViewState {
    text: string
    text2: string
}

export default function render(viewState: ViewState) {
    return e('div', {}, [
        e('div', {}, [viewState.text], viewState, viewState.text, uTContent(vs => vs.text)),
        e('div', {}, ['static']),
        e('div', {}, [viewState.text2], viewState, viewState.text2, uTContent(vs => vs.text2))

    ]);
}

