import {conditional, element as e, dynamicElement as de, updateTextContent as uTContent} from '../../lib/element';

interface ViewState {
    text1: string,
    text2: string,
    cond: boolean
}

export default function render(viewState: ViewState) {
    return de('div', {}, [
        conditional((newViewState) => newViewState.cond,
            e('div', {style: {cssText: 'color:red'}}, [viewState.text1], viewState, viewState.text1, uTContent(vs => vs.text1))
        ),
        conditional((newViewState) => !newViewState.cond,
            e('div', {style: {cssText: 'color:green'}}, [viewState.text2], viewState, viewState.text2, uTContent(vs => vs.text2))
        )
    ], viewState);
}

